/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright 2026 CLSOFTLAB (씨엘소프트랩), Dr. Lee Il-guk (이일국)
 *
 * ai/config.js — AI 연동 설정.
 */

/**
 * AI_ENDPOINT — 실제 Claude 호출을 중계할 백엔드 프록시의 URL.
 *
 *  - 빈 문자열("")이면 → 내장 MockProvider(데모 AI 목업)를 사용합니다.
 *    (라이브 GitHub Pages 데모는 이 상태로 동작 — 백엔드/키가 전혀 필요 없음)
 *  - 실제 Claude를 붙이려면 → `server/`(참조 프록시)를 운영자의
 *    ANTHROPIC_API_KEY 로 배포한 뒤, 그 배포 URL을 여기에 넣습니다.
 *    예: export const AI_ENDPOINT = "https://my-proxy.example.com/api/ai";
 *
 * ⚠️ API 키는 절대 브라우저나 저장소에 두지 않습니다. 키는 오직 서버(server/)에만.
 *    이 파일에는 키가 아니라 "프록시 주소"만 들어갑니다.
 */
export const AI_ENDPOINT = "";
