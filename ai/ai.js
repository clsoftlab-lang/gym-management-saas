/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright 2026 CLSOFTLAB (씨엘소프트랩), Dr. Lee Il-guk (이일국)
 *
 * ai/ai.js — AI 연동 레이어 (secure, pluggable).
 *
 *  askAI(task, payload, {onToken}) 하나로 세 가지 AI 기능을 처리한다.
 *   - AI_ENDPOINT 가 비어 있으면 → 내장 MockProvider (데모 AI, 결정적/오프라인)
 *   - AI_ENDPOINT 가 설정돼 있으면 → 그 백엔드 프록시로 POST 후 스트리밍 수신
 *
 *  MockProvider 는 앱의 실제 데이터/집계 엔진(js/store.js)을 재사용해
 *  가상의 회원/출석 데이터로 그럴듯한 한국어 결과를 만든다. 출력은 항상
 *  "데모 AI" 임을 명시한다. 키는 브라우저/저장소 어디에도 없다.
 */

import { AI_ENDPOINT } from './config.js';
import { db, expiringSoon } from '../js/store.js';

/* ------------------------------------------------------------------ *
 *  Task registry — 세 가지 AI 기능
 * ------------------------------------------------------------------ */
export const TASKS = [
  { id: 'coach', label: 'AI 트레이너 코치 챗봇', desc: '운동·식단·이용권 질문에 답하는 코치' },
  { id: 'retention', label: '이탈 위험 요약 + 리텐션 메시지', desc: '위험 회원 진단과 맞춤 재등록 문자 초안' },
  { id: 'notice', label: '공지/문자 문구 자동 작성', desc: '짧은 브리핑으로 공지·안내 문구 생성' },
  { id: 'briefing', label: '오늘의 운영 브리핑', desc: '만료 임박·이탈 위험·매출을 자동 요약(대시보드 자동 실행)' },
];
export const TASK_IDS = TASKS.map((t) => t.id);

const DEMO_TAG = '〔데모 AI · 목업 응답 — 실제 LLM 호출 아님〕';

/* ------------------------------------------------------------------ *
 *  Public entry
 * ------------------------------------------------------------------ */
export async function askAI(task, payload = {}, { onToken } = {}) {
  if (!TASK_IDS.includes(task)) throw new Error(`알 수 없는 AI 작업: ${task}`);
  if (AI_ENDPOINT && String(AI_ENDPOINT).trim()) {
    try {
      return await callEndpoint(task, payload, onToken);
    } catch (e) {
      // AUTO-FALLBACK (무인 운영): 엔드포인트 실패 / 429(예산·레이트 초과, {fallback:true}) /
      // 네트워크 오류 → 내장 목업으로 폴백해 앱이 절대 멈추지 않게 한다.
      console.warn('AI 엔드포인트 폴백 → 내장 목업 사용:', (e && e.message) ? e.message : e);
    }
  }
  return MockProvider[task](payload, onToken);
}

/* ------------------------------------------------------------------ *
 *  Real path — POST to the operator's backend proxy, stream the reply
 * ------------------------------------------------------------------ */
async function callEndpoint(task, payload, onToken) {
  const res = await fetch(AI_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ task, payload }),
  });
  if (!res.ok) throw new Error(`AI 서버 오류: ${res.status} ${res.statusText}`);
  // Stream the reply if the environment supports it and a token callback was given.
  if (res.body && typeof res.body.getReader === 'function' && typeof onToken === 'function') {
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let full = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      full += chunk;
      onToken(chunk);
    }
    full += decoder.decode();
    return full;
  }
  const text = await res.text();
  if (typeof onToken === 'function') onToken(text);
  return text;
}

/* ------------------------------------------------------------------ *
 *  Mock streaming helper — emit deterministic chunks, return full text
 * ------------------------------------------------------------------ */
async function streamOut(text, onToken) {
  if (typeof onToken !== 'function') return text;
  const chunks = text.match(/[\s\S]{1,26}/g) || [text];
  for (const c of chunks) {
    onToken(c);
    // small, fixed delay so the UI shows a "typing" effect (content is deterministic)
    await new Promise((r) => setTimeout(r, 14));
  }
  return text;
}

/* ------------------------------------------------------------------ *
 *  MockProvider — deterministic Korean outputs from the app's own data
 * ------------------------------------------------------------------ */
function recentAttendance(memberId, days = 30, today = '2026-09-17') {
  const from = new Date(today);
  from.setDate(from.getDate() - days);
  const fromKey = from.toISOString().slice(0, 10);
  return db.attendance.filter((a) => a.memberId === memberId && a.date >= fromKey && a.date <= today).length;
}
function lastVisit(memberId) {
  const dates = db.attendance.filter((a) => a.memberId === memberId).map((a) => a.date).sort();
  return dates.length ? dates[dates.length - 1] : null;
}
const fmt = (d) => (d ? String(d).replace(/-/g, '.').slice(2) : '-');

const MockProvider = {
  /* (1) AI 트레이너 코치 챗봇 — keyword-routed, deterministic advice */
  coach(payload, onToken) {
    const q = String(payload.question || '').trim();
    const m = payload.member || null;
    const head = [DEMO_TAG];
    if (m) {
      const bits = [`${m.name}님 (${m.plan})`];
      if (m.left != null) bits.push(m.left >= 0 ? `이용권 D-${m.left}` : '이용권 만료');
      if (m.ptLeft) bits.push(`PT 잔여 ${m.ptLeft}회`);
      if (m.attendanceCount != null) bits.push(`최근 30일 출석 ${m.attendanceCount}회`);
      head.push(`👤 ${bits.join(' · ')}`);
    }
    head.push('');

    const has = (...kw) => kw.some((k) => q.includes(k));
    let body;
    if (!q) {
      body = ['무엇이 궁금하신가요? 예: "다이어트 식단 짜줘", "무릎이 아픈데 하체 운동 가능할까?",',
        '"PT 예약은 어떻게 해?", "근육 늘리려면 몇 분할이 좋아?" 처럼 물어보세요.'].join('\n');
    } else if (has('식단', '다이어트', '체중', '살', '감량', '단백질', '영양', '칼로리')) {
      body = ['🥗 식단·다이어트 가이드',
        '• 감량기에는 유지 칼로리에서 300~500kcal만 줄이세요. 급격한 절식은 근손실·요요를 부릅니다.',
        '• 단백질은 체중 1kg당 1.6~2.0g. 끼니마다 손바닥 크기 단백질(닭가슴살/두부/계란)을 배치하세요.',
        '• 탄수화물은 "운동 전후"에 몰아주면 수행력과 회복에 유리합니다.',
        '• 물 1.5~2L, 채소·식이섬유로 포만감을 채우면 야식 충동이 줄어듭니다.',
        m && m.ptLeft ? `• ${m.name}님은 PT ${m.ptLeft}회가 남아 있으니 담당 트레이너와 식단 피드백을 함께 받으시면 좋아요.` : '• 담당 트레이너에게 인바디 기록을 공유하면 더 정밀한 코칭이 가능합니다.'].join('\n');
    } else if (has('근육', '근력', '벌크', '웨이트', '스트렝스', '분할', '무게')) {
      body = ['💪 근력·근비대 가이드',
        '• 주 3~4회, 초보자는 전신 2분할부터. 큰 근육(하체·등·가슴)을 우선 배치하세요.',
        '• 근비대는 세트당 8~12회, 근력은 3~6회로 무게를 높입니다. 세트 사이 휴식 60~120초.',
        '• 매주 조금씩 무게/횟수를 올리는 "점진적 과부하"가 핵심입니다.',
        '• 잘 자고(7시간+) 단백질을 충분히 먹어야 근합성이 일어납니다.'].join('\n');
    } else if (has('유산소', '체력', '러닝', '달리기', '심폐', '지구력', 'HIIT', '스피닝')) {
      body = ['🏃 유산소·체력 가이드',
        '• 체지방 관리는 주 150분 중강도 유산소가 기준입니다(빠르게 걷기·사이클 등).',
        '• 시간이 부족하면 HIIT 20분(20초 전력 / 40초 회복 × 8) 으로 대체할 수 있어요.',
        '• 근력 운동 후 유산소를 배치하면 근성장에 방해가 덜 됩니다.',
        '• 무릎·발목이 약하면 사이클/로잉 같은 저충격 종목을 권합니다.'].join('\n');
    } else if (has('부상', '통증', '아파', '아픈', '재활', '무릎', '어깨', '허리', '손목')) {
      body = ['🩹 통증·재활 주의',
        '• 통증이 있는 부위는 무리한 고중량을 피하고, 통증 없는 가동범위에서만 가볍게 움직이세요.',
        '• 급성 통증(붓기·찌릿함)이 있으면 운동을 멈추고 정형외과 진료를 먼저 받으세요.',
        '• 회복기에는 코어·주변 근육 강화와 스트레칭으로 재발을 예방합니다.',
        m && m.memo ? `• 참고 메모: "${m.memo}" — 담당 트레이너와 공유해 강도를 조절하세요.` : '• 부상 이력은 담당 트레이너에게 꼭 알려 주세요.',
        '(본 데모는 의료 조언이 아닙니다. 통증은 전문의 상담이 우선입니다.)'].join('\n');
    } else if (has('예약', '수업', '클래스', 'PT', '스케줄', '시간표')) {
      body = ['📅 예약 안내',
        '• [회원용 화면] 또는 [수업·예약] 메뉴에서 요일별 시간표를 보고 예약할 수 있어요.',
        '• 정원이 마감된 수업은 예약 버튼이 "마감"으로 표시됩니다.',
        m && m.ptLeft ? `• ${m.name}님은 PT ${m.ptLeft}회가 남아 있어 PT 슬롯 예약이 가능합니다.` : '• PT는 이용권에 PT 횟수가 포함되어 있어야 예약됩니다.'].join('\n');
    } else if (has('이용권', '연장', '재등록', '등록', '락커', '결제', '환불', '만료')) {
      body = ['🎫 이용권·결제 안내',
        m && m.left != null
          ? (m.left >= 0 ? `• 현재 이용권(${m.plan})은 ${m.left}일 남았습니다(~${fmt(m.endDate)}).` : `• 이용권(${m.plan})이 만료되었습니다. 재등록 시 이어서 이용할 수 있어요.`)
          : '• 이용권 연장/재등록은 [회원 관리] 상세에서 "연장·재등록"으로 처리합니다.',
        '• 장기권(6·12개월)일수록 월 단가가 낮아 유리합니다.',
        '• 락커는 이용중(active) 회원에게만 배정되며 이용권 만료일에 맞춰 관리됩니다.'].join('\n');
    } else {
      body = ['🤖 운동 코치 요약',
        '• 목표(감량/근성장/체력)를 정하면 운동·식단·빈도를 그에 맞춰 조정할 수 있어요.',
        '• 기본 공식: 주 3~4회 규칙적 운동 + 충분한 단백질 + 7시간 수면.',
        '• 더 구체적으로 물어보시면(부위/부상/식단/예약 등) 맞춤 답변을 드립니다.'].join('\n');
    }
    return streamOut([...head, body].join('\n'), onToken);
  },

  /* (2) 이탈 위험 요약 + 맞춤 리텐션 메시지 */
  retention(payload, onToken) {
    let m = payload.member;
    // payload 에 회원이 없으면 앱 데이터에서 가장 위험한 회원을 직접 고른다.
    if (!m) {
      const soon = expiringSoon(30);
      const pick = soon[0];
      if (pick) {
        m = {
          id: pick.id, name: pick.name, plan: pick.plan, endDate: pick.endDate,
          left: pick.left, phone: pick.phone,
          attendanceCount: recentAttendance(pick.id), lastVisit: lastVisit(pick.id),
        };
      }
    }
    if (!m) {
      return streamOut([DEMO_TAG, '', '현재 이탈 위험(만료 임박/출석 저조) 회원이 없습니다. 🎉'].join('\n'), onToken);
    }
    const att = m.attendanceCount != null ? m.attendanceCount : recentAttendance(m.id);
    const lv = m.lastVisit || lastVisit(m.id);
    const risks = [];
    if (m.left != null && m.left >= 0 && m.left <= 7) risks.push(`이용권 만료 임박 (D-${m.left}, ~${fmt(m.endDate)})`);
    else if (m.left != null && m.left < 0) risks.push('이용권 이미 만료');
    else if (m.left != null && m.left <= 30) risks.push(`이용권 만료 예정 (D-${m.left})`);
    if (att <= 2) risks.push(`최근 30일 출석 ${att}회로 매우 저조`);
    else if (att <= 5) risks.push(`최근 30일 출석 ${att}회로 다소 저조`);
    if (lv) risks.push(`마지막 방문 ${fmt(lv)}`);
    if (!risks.length) risks.push('뚜렷한 위험 신호는 낮지만 만료 주기 관리 권장');

    const level = (m.left != null && m.left <= 7) || att <= 2 ? '높음 🔴' : att <= 5 || (m.left != null && m.left <= 30) ? '중간 🟡' : '낮음 🟢';

    const incentive = att <= 2
      ? '오랜만에 나오시는 만큼 무료 PT 1회 + 운동 목표 재설정 상담'
      : (m.left != null && m.left <= 7)
        ? '만료 전 재등록 시 1개월 추가 또는 락커 3개월 무료'
        : '재등록 시 친구 동반 1일권 2매 증정';

    const sms = `[짐매니저] ${m.name}님, 요즘 발걸음이 뜸하셨죠? ${
      m.left != null && m.left >= 0 ? `이용권이 ${fmt(m.endDate)}에 만료돼요. ` : '다시 시작하기 딱 좋은 때예요. '
    }지금 재등록하시면 ${incentive} 혜택을 드립니다. 편하신 시간에 방문해 주세요! (데모 문자)`;

    const out = [
      DEMO_TAG,
      '',
      `■ 이탈 위험 요약 — ${m.name}님`,
      `• 위험도: ${level}`,
      `• 이용권: ${m.plan}${m.left != null ? ` (D-${m.left})` : ''}`,
      `• 위험 신호: ${risks.join(' / ')}`,
      `• 추천 리텐션 액션: ${incentive}`,
      '',
      '■ 맞춤 리텐션 문자 초안',
      sms,
      '',
      '※ 실제 발송은 SMS/알림톡 게이트웨이 연동이 필요합니다(데모에서는 발송되지 않음).',
    ].join('\n');
    return streamOut(out, onToken);
  },

  /* (3) 공지/문자 문구 자동 작성 */
  notice(payload, onToken) {
    const brief = String(payload.brief || '').trim();
    const channel = payload.channel || '문자';
    const tone = payload.tone || '정중';
    const brand = (db.meta && db.meta.brand) || '짐매니저';
    if (!brief) {
      return streamOut([DEMO_TAG, '', '작성할 내용을 한 줄로 알려 주세요. 예: "추석 연휴 9/26~9/28 휴관", "신규 스피닝 클래스 오픈".'].join('\n'), onToken);
    }
    const opener = tone === '친근' ? `안녕하세요, ${brand} 가족 여러분! 😊`
      : tone === '긴급' ? `[중요 안내] ${brand} 이용 회원님께 알립니다.`
        : `안녕하세요, ${brand}입니다.`;
    const closer = tone === '친근' ? '늘 함께해 주셔서 감사합니다. 오늘도 화이팅! 💪'
      : tone === '긴급' ? '회원님의 양해와 협조 부탁드립니다.'
        : '이용에 참고해 주시기 바라며, 문의사항은 프런트로 연락 주세요. 감사합니다.';

    // 브리핑에서 제목 후보 추출(첫 구절)
    const title = brief.split(/[.\n·|]/)[0].slice(0, 40).trim();
    const isClosure = /(휴관|휴무|중단|점검|공사|폐쇄)/.test(brief);
    const isOpen = /(오픈|신규|출시|런칭|개설|이벤트|할인|프로모션|모집)/.test(brief);
    const cta = isClosure ? '방문 전 운영시간을 꼭 확인해 주세요.'
      : isOpen ? '자세한 내용과 신청은 프런트 또는 회원용 화면에서 확인하세요.'
        : '자세한 사항은 프런트에 문의해 주세요.';

    const full = [
      opener,
      '',
      `📢 ${title || '공지'}`,
      brief,
      '',
      cta,
      closer,
    ].join('\n');

    // 문자용 축약본(약 90자)
    const smsCore = brief.replace(/\s+/g, ' ').slice(0, 70);
    const sms = `[${brand}] ${smsCore}${brief.length > 70 ? '…' : ''} — ${cta}`;

    const out = [
      DEMO_TAG,
      `채널: ${channel} · 톤: ${tone}`,
      '',
      '■ 공지/게시용 문구',
      full,
      '',
      '■ 문자(SMS) 축약본',
      sms,
    ].join('\n');
    return streamOut(out, onToken);
  },

  /* (4) 오늘의 운영 브리핑 — 대시보드 로드 시 자동 실행(무인). 앱 자체 집계 엔진 재사용. */
  briefing(payload, onToken) {
    const p = payload || {};
    const today = p.today || '2026-09-17';
    const mKey = today.slice(0, 7);
    const money = (n) => '₩' + Math.round(Number(n) || 0).toLocaleString('ko-KR');

    const soon = (p.expiringSoon && p.expiringSoon.length)
      ? p.expiringSoon
      : expiringSoon(7).map((m) => ({ name: m.name, plan: m.plan, left: m.left }));
    const expiringCount = p.expiringCount != null ? p.expiringCount : soon.length;
    const atRisk = Array.isArray(p.atRisk) ? p.atRisk : [];
    const monthRevenue = p.monthRevenue != null ? p.monthRevenue
      : db.payments.filter((x) => x.date.slice(0, 7) === mKey).reduce((s, x) => s + (Number(x.amount) || 0), 0);
    const todayCheckins = p.todayCheckins != null ? p.todayCheckins
      : db.attendance.filter((a) => a.date === today).length;
    const activeMembers = p.activeMembers != null ? p.activeMembers
      : db.members.filter((m) => m.status === 'active').length;

    const soonNames = soon.slice(0, 3).map((m) => `${m.name}(D-${m.left})`).join(', ');
    const riskNames = atRisk.slice(0, 3).map((m) => `${m.name}(30일 ${m.att ?? m.attendanceCount ?? '-'}회)`).join(', ');

    const actions = [];
    if (expiringCount > 0) actions.push(`만료 임박 ${expiringCount}명에게 리텐션 문자 발송(‘이탈 리텐션’ 탭)`);
    if (atRisk.length > 0) actions.push(`출석 저조 ${atRisk.length}명 팔로업 연락`);
    if (!actions.length) actions.push('오늘은 특별한 위험 신호가 없습니다. 신규 상담·수업 만족도 점검을 권장합니다.');

    const out = [
      DEMO_TAG,
      `📋 오늘의 운영 브리핑 · ${today}`,
      '',
      `• 만료 임박(7일): ${expiringCount}명${soonNames ? ` — ${soonNames}` : ''}`,
      `• 이탈 위험(출석 저조): ${atRisk.length}명${riskNames ? ` — ${riskNames}` : ''}`,
      `• 이번 달 매출: ${money(monthRevenue)} (${mKey}) · 오늘 출석 ${todayCheckins}명 · 이용중 ${activeMembers}명`,
      '',
      '■ 추천 액션',
      ...actions.map((a) => `• ${a}`),
    ].join('\n');
    return streamOut(out, onToken);
  },
};

export { MockProvider };
