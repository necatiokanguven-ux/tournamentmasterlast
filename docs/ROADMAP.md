# Tournament Master — Architecture Roadmap

**Version:** 1.0  
**Last updated:** 2026-07-10  
**Principle:** Each phase completes before the next begins. Default behavior remains **db.json + HTTP poll** until explicitly enabled via flags.

---

## Target architecture

```text
Single venue server
├── TourMasterSetup.exe + embedded Node + PostgreSQL (Phase 11b)
├── Layered port control + single-instance (Phase 11b.6)
├── PM2 / launcher graceful shutdown (Phase 10)
├── WebSocket push + HTTP fallback (Phases 4–5)
├── Grace Recovery — 2 min freeze + rehydrate (Phase 5G)
├── Dealer Zone — chaos prevention (Phase 6)
└── Redis optional (Phase 9)
```

---

## Safety rules (every phase)

1. **DEFAULT = today's behavior** — `USE_POSTGRES=false`, `VITE_USE_WS=false`, `DEALER_ZONES=false`
2. **Strangler fig** — new path alongside old; flags off = unchanged system
3. **db.json fallback** — if PG missing / config missing / connection fails → `JsonFileRepository`
4. **One PR per sub-phase** — no mega-refactors
5. **After each phase:** `npm run lint`, `npm run build`, smoke (clock, players, floor, dealer control)
6. **API v1** — existing `/api/*` response shapes preserved
7. **main branch** always deployable

---

## Priority order (first → last)

| Order | Phase | Summary | Breaks current prod? |
|-------|-------|---------|----------------------|
| 1 | **F0** | Documentation | No |
| 2 | **F1** | Repository abstraction (JSON adapter) | No |
| 3 | **F2** | PostgreSQL schema + repo + migration | No — `USE_POSTGRES=false` default |
| 4 | **F2.8** | PG credentials auto-generated + config | No — PG only |
| 5 | **F10** | Graceful shutdown | Low — test required |
| 6 | **F11b.6** | Port + single-instance (launcher) | No — separate package |
| 7 | **F11b** | Setup.exe + embedded Node/PG | No — old zip parallel |
| 8 | **F3** | Single-server ops doc | No |
| 9 | **F4** | WS hub + feature flag | No — `VITE_USE_WS=false` |
| 10 | **F5A** | Clock WS channel | No — poll fallback |
| 11 | **F5B** | Floor WS | No |
| 12 | **F5C** | Dealer phone WS + session token | No |
| 13 | **F5G** | Grace Recovery + rehydrate | No — opt-in |
| 14 | **F5D** | Dealer Control WS | No |
| 15 | **F6** | **Dealer Zone** | Medium — zone flag |
| 16 | **F5E** | Director WS (highest read risk) | Careful |
| 17 | **F5F** | Timer WS merge | Low |
| 18 | **F7** | Poll cleanup | After PG+WS stable |
| 19 | **F9** | Redis (metrics-based) | Optional |
| 20 | **F11** | Bat zip legacy (dev) | Parallel |
| 21 | **F8** | Advanced features | Last |

---

## Phase details

### F0 — Documentation

- [x] F0.1 `docs/ROADMAP.md` (this file)
- [x] F0.2 `docs/ARCHITECTURE.md` — high-level diagram
- [x] F0.3 `docs/DATABASE.md` — PG migration plan

**Exit:** Team knows phase order and safety rules.

---

### F1 — Repository abstraction (PG-first, JSON default)

- [x] F1.1 `TournamentRepository` interface
- [x] F1.2 `JsonFileRepository` — wraps current `db.json` load/save
- [x] F1.3 `createRepository()` factory in server bootstrap
- [x] F1.4 All routes use repository; zero behavior change
- [x] F1.5 `npm run lint` + `npm run build` pass

**Exit:** Abstraction layer exists; production identical to pre-F1.

---

### F2 — PostgreSQL

- [x] F2.1 Schema + versioned SQL migrations
- [x] F2.2 `PostgresRepository` implementing `TournamentRepository`
- [x] F2.3 Optimistic lock (`version` column on `tournament_document`)
- [x] F2.4 `USE_POSTGRES` env; auto fallback to JSON
- [x] F2.5 `json → PG` import CLI (`npm run import:json-to-pg`)
- [x] F2.6 `pg_dump` backup procedure doc

#### F2.8 — PostgreSQL credentials (no user-facing passwords)

- [x] F2.8.1 First init: role `tournament_app` + random password helpers
- [x] F2.8.2 Config: `%ProgramData%/TournamentMaster/config/database.json` (or `./data/config/database.json` dev)
- [x] F2.8.3 Node builds `DATABASE_URL`; dev override via `.env.local`
- [x] F2.8.4 `pg_hba` localhost only; embedded PG port **5433** (`init-embedded-pg.ps1`)
- [x] F2.8.5 Installer upgrade preserves config + pgdata (data in `%ProgramData%`, ISS preserve log)
- [x] F2.8.6 No username/password prompts in customer UI (spec + helpers)

**Exit:** Full tournament dry-run on PG; JSON fallback still works.

---

### F3 — Single-server operations

- [x] F3.1 One server + N operator browsers doc (`docs/OPERATIONS.md`)
- [x] F3.2 LAN / static IP / firewall
- [x] F3.3 40+ table PG dry-run guidance

---

### F4 — WebSocket hub

- [x] F4.1 Subscribe / snapshot / delta protocol (`/ws/tournament`, `meta` channel)
- [x] F4.2 `useTournamentSocket` + `VITE_USE_WS=false` default
- [x] F4.3 Dealer rotation maintenance moved to server background tick (5s); `/state` read-only

---

### F5 — WebSocket channels (order: 5A → 5B → 5C → 5G → 5D → 5E → 5F)

#### F5A — Clock
- [x] WS `clock` channel; poll fallback (`VITE_USE_WS=false` default)

#### F5B — Floor
- [x] WS `floor:{teamId}`; poll fallback

#### F5C — Dealer phone
- [x] WS `dealer-phone:{dealerId}`; session token foundation

#### F5G — Grace Recovery & State Rehydration

- [x] F5G.1 Staff fields: `phoneSessionToken`, `phoneDeviceId`, `phoneLastSeenAt`, `phoneGraceUntil`, `stateBeforeDisconnect`
- [x] F5G.2 `DEALER_PHONE_GRACE_MS = 120_000`
- [x] F5G.3 `POST /api/dealer-control/phone/session/start`
- [x] F5G.4 `POST /api/dealer-control/phone/rehydrate`
- [x] F5G.5 `beginPhoneGrace` / `rehydratePhoneSession` / `processPhoneGraceExpiries`
- [x] F5G.6 Engine guards during grace (no assign steal while in grace)
- [x] F5G.7 WS disconnect → grace; reconnect → rehydrate
- [x] F5G.8 Client `dealerSession.ts` localStorage
- [x] F5G.9 Operator grace badge
- [x] F5G.10 Poll fallback heartbeat before WS
- [x] F5G.11 Test matrix (`docs/CHECKLIST-DEALER-PHONE-GRACE.md`)
- [x] F5G.12 PG `dealer_staff` columns (`004_dealer_staff_phone_grace.sql` + shadow sync)

#### F5D — Dealer Control WS (after F6 zones)
- [x] `dealer-control` + `dealer-control:{zoneId}` channels

#### F5E — Director store (last)
- [x] `director` channel triggers director sync (alongside `meta`)

#### F5F — Timer WS merge
- [x] Merge `/ws/dealer/table/{n}/timer` broadcasts into hub (`dealer-timer:{n}`); legacy path retained

---

### F6 — Dealer Zone (critical)

- [x] F6.1 `DealerZone` model + settings (`dealerZones[]`, staff `zoneId`)
- [x] F6.2 Zone-scoped pool / tick / API (`DEALER_ZONES=false` default)
- [x] F6.3 `?zone=` + WS channel `dealer-control:{zoneId}`
- [x] F6.3b Dealer Control UI — zone setup modal, staff zone assignment
- [x] F6.4 Row lock / version per zone (`meta.zoneVersions`, 409 conflict)
- [x] F6.5 Load test script (`npm run load-test:zones`)

**Exit:** Multi-operator large tournament without global pool chaos.

---

### F7 — Poll cleanup & hardening

- [x] F7.1 Configurable fallback poll intervals (15s when WS connected)
- [x] F7.2 WS reconnect UI (director banner)
- [x] F7.3 Load test: 80 dealers + 5 operators (`npm run load-test:dealers`)

---

### F8 — Optional advanced

- [x] F8.1 WS RPC for writes (`clock.sync` when `WS_RPC_WRITES=true`)
- [x] F8.1a WS RPC read-only foundation (`health`, `meta` via rpc)
- [x] F8.2 PG read replica stub (`DATABASE_READ_URL`, `getOptionalReadPool()` — reporting only)
- [x] F8.3 Unified dashboard (`GET /api/admin/dashboard`, localhost only)

---

### F9 — Redis (optional, metrics-based)

- [x] F9.1 Metrics collection stub (`/api/health` metrics)
- [x] F9.2 Portable Redis venue setup (`runtime/redis`, `ensure-redis.ps1`)
- [x] F9.3 Pub/sub facade stub (`publishTournamentEvent`)
- [x] F9.4 Zone/table distributed lock (`distributedLock.ts`, 423 `ZONE_LOCK_BUSY`)
- [x] F9.5 Snapshot cache TTL 1–2s (`snapshotCache.ts`, `SNAPSHOT_CACHE` or `USE_REDIS`)
- [x] F9.6 Fallback when Redis down (in-memory cache + locks)

**Adopt when:** PG p95 slow / multi-worker / lock contention — otherwise skip.

---

### F10 — PM2 & graceful shutdown (PostgreSQL)

- [x] F10.1 `ecosystem.config.cjs` (`instances: 1`)
- [x] F10.2 SIGTERM/SIGINT: HTTP close, PG pool end, rotation interval clear
- [x] F10.3 Startup health `/api/health`
- [x] F10.4 Idempotent rotation tick (skip during shutdown)
- [x] F10.5 Crash/restart PG consistency test (manual — `docs/CHECKLIST-PG-RESTART.md`)
- [x] F10.5 Checklist doc (`docs/CHECKLIST-PG-RESTART.md`)
- [x] F10.6 Venue: `pm2 save`, graceful stop doc + `/api/admin/shutdown`

---

### F11 — Portable PG + bat (legacy / dev)

- [x] F11.1 Embedded/portable postgres orchestration (`runtime/postgres` + init scripts)
- [x] F11.2 `start.bat` orchestration (runtime node + PG + port control)
- [x] F11.3 `backup.bat` → db.json (+ optional `pg_dump` when DATABASE_URL set)
- [x] F11.4 CI zip build (`npm run package:test-win`)

---

### F11b — One-click installer (embedded Node)

#### F11b.1–F11b.5
- [x] Embedded `runtime/node.exe` path resolution (`ensure-runtime.ps1`)
- [x] Embedded `runtime/postgres/` init + start (port 5433, localhost-only)
- [x] System tray launcher (`TourMasterLauncher.bat` + `tray-launcher.ps1`, Restart menu)
- [x] `TourMasterSetup-portable.zip` (`npm run build:installer`)
- [x] `TourMasterSetup.exe` (`npm run build:installer` / `build:installer:full`)
- [x] `TourMasterSetup.iss` + `npm run build:installer` staging pipeline
- [x] System tray launcher (`TourMasterLauncher.bat` + `tray-launcher.ps1`)
- [x] Data in portable `data/` or `%ProgramData%/TournamentMaster/data/` (`TM_DATA_DIR`)
- [x] System Node fallback only when embedded runtime missing (dev zip)

#### F11b.6 — Port & single-instance (layered — no blind kill)

- [x] F11b.6.1 Launcher: port **3000** check + fallback **3001** (`packaging/scripts/ensure-port.ps1`)
- [x] F11b.6.2 Process tanıma: bizim `dist/server.cjs` + install path
- [x] F11b.6.3 Bizim process → graceful stop → restart (`restart-server.bat`, tray Restart)
- [x] F11b.6.3 `stop.bat` + `/api/admin/shutdown` graceful stop
- [x] F11b.6.4 Yabancı process → fallback port 3001 (`TM_HTTP_PORT`) — **sessiz kill YOK**
- [x] F11b.6.5 Single-instance: ikinci `start.bat` → tarayıcı aç, yeni process başlatma
- [x] F11b.6.6 `TM_HTTP_PORT` env + `resolveServerPort()` in server
- [x] F11b.6.7 QR / LAN URL dynamic port docs in venue UI (`VenuePortHint`)
- [x] F11b.6.8 Test matrisi (`docs/CHECKLIST-VENUE-TEST.md`)

#### F11b.7 — Zero credential UX
- [x] README: no PostgreSQL install required when using db.json default
- [x] Auto-generated credentials in `data/config/database.json` when embedded PG init runs

---

## Permanent decisions log

| # | Decision |
|---|----------|
| 1 | Target: single server + PostgreSQL (multi-pod is temporary workaround) |
| 2 | Dealer Zone required for 60+ tables / multi DC operator |
| 3 | WebSocket channel-by-channel with HTTP fallback |
| 4 | Redis Phase 9 optional |
| 5 | PM2 / launcher graceful shutdown Phase 10 |
| 6 | Customer delivery: Setup.exe not zip (Phase 11b) |
| 7 | Layered port control — no blind port kill |
| 8 | Grace Recovery 2 min + rehydrate (Phase 5G) |
| 9 | PG credentials auto-generated — user never sees password (Phase 2.8) |

---

## Phase completion checklist (run after every phase)

```bash
npm run lint
npm run build
# Smoke: start server, open clock, players, floor, dealer control
```

---

## Related docs

- `docs/OPERATIONS.md` — venue single-server ops (Phase 3)
- `packaging/README-win.txt` — current Windows zip distribution
- Multi-pod operational spec — conversation archive / future `docs/MULTI_POD.md`
