# 🏋️ 짐매니저 — Gym Management SaaS

A single-page **gym operations SaaS** demo for a gym owner/manager: members, check-ins, class/PT bookings, lockers, revenue dashboard, instructor schedule, workout/diet notes, mock reminders, and a member-facing portal. Runs entirely in the browser — no backend, no build step.

**English** · [한국어 README](README.ko.md)

**🔴 LIVE DEMO: https://clsoftlab-lang.github.io/gym-management-saas/**

---

## What it is

짐매니저 ("Gym Manager") is a **운동 서비스업 통합 스마트 웹 플랫폼** — one web app to run a fitness business. It ships as a no-build static site (plain HTML + CSS + ES-module JS), so GitHub Pages serves it as-is.

## Features (all working in demo mode)

- **Dashboard** — KPI cards (total/active members, today's check-ins, monthly revenue, expiring soon) plus 3 charts: monthly revenue (bar), plan mix (doughnut), 14-day attendance trend (line).
- **Members** — list with live **search** (name/phone/id), **filter** (status, plan), **sortable columns**; add / edit / delete; per-member detail (attendance count, payments, locker, PT sessions); renew/extend a plan; pause & resume; one-click check-in.
- **Attendance** — quick check-in station (type-to-find), today's live roster, attendance rate.
- **Classes & Bookings** — weekly timetable grouped by day, capacity/fill bars, book/cancel members into group classes and PT slots, instructor roster.
- **Lockers** — zone locker map, assign/release lockers to active members, utilization stats.
- **Payments & Revenue** — filterable payment ledger, monthly revenue chart, CSV export.
- **Reminders** — expiry reminders (7/30-day) with a **mock** SMS template and "send" tracking.
- **Member portal** — member-facing view: my plan/D-day, my bookings, self check-in, book classes, PT/locker status. Switchable demo account.
- **Persistence** — all edits saved to `localStorage`; **"reset demo data"** button restores the shipped seed.
- **UX** — responsive mobile-first, light/dark via `prefers-color-scheme`, Korean UI, toasts, modals.

## Run locally

```bash
# from the repo root
python -m http.server 8000
# then open:
#   http://localhost:8000/
```

Any static file server works (it must be served over http:// — opening `index.html` as a `file://` URL blocks `fetch` of the JSON seeds).

## Validate

```bash
node check.mjs
```

Checks that every `data/*.json` parses, every `.js`/`.mjs` passes `node --check`, and `index.html` has the required root elements. CI runs the same on every push (`.github/workflows/ci.yml`).

## 🟨 DEMO-MODE boundaries (read this)

**This is a demonstration app. It is NOT a production system.**

- **Demo/seed data only.** All members, phone numbers, payments, and schedules are **fictional** and generated for the demo. **No real people, no real PII.**
- **`localStorage` is not a real database.** Data lives only in your browser, is not shared between devices/users, and can be cleared at any time.
- **No real payments.** Revenue/ledger figures are fake; nothing is charged.
- **No real SMS/notifications.** The reminder "send" is a UI mock — no message leaves the browser.
- **No accounts / no authentication.** The member portal account switcher is a demo convenience, not a login.
- **A real deployment would add:** a backend + database, authentication & authorization, real payment (PG) integration, real SMS/알림톡 gateway, and proper **PII handling & privacy/compliance** (e.g., Korea's PIPA).

## Tech

- No-build static SPA: `index.html` + `styles.css` + ES-module JS (`app.js`, `js/*`).
- [Chart.js](https://www.chartjs.org/) via CDN (cdn.jsdelivr.net) for charts; everything else is inline/local.
- Seed data as `data/*.json`; hash-based router; `localStorage` persistence wrapped in try/catch.
- Relative paths only, so it works under a GitHub Pages subpath.

## Project structure

```
index.html          # entry, root elements + Chart.js CDN
styles.css          # responsive, light/dark
app.js              # router + nav + boot
js/util.js          # dom/format/modal/toast helpers
js/store.js         # seed load + localStorage + CRUD + derived stats
js/charts.js        # Chart.js wrappers (theme-aware)
js/views/*.js       # dashboard, members, attendance, schedule, lockers, payments, reminders, portal
data/*.json         # fictional seed data
check.mjs           # validator (CI + local)
```

## Contributors

- **Dr. Lee Il-guk (이일국)** — CLSOFTLAB (씨엘소프트랩)
- **LWJ**, **LMJ**
- **Claude** (Anthropic) — pair development

## License

- **Code:** [Apache-2.0](LICENSE)
- **Docs:** CC BY 4.0

Copyright 2026 CLSOFTLAB (씨엘소프트랩), Dr. Lee Il-guk (이일국).

---

*Not an official Anthropic product.*
