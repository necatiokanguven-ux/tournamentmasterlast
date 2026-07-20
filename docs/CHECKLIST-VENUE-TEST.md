# Venue manual test matrix (F11b.6.8)

Use the packaged zip (`npm run package:test-win`) on a clean Windows machine or VM. Default path: `release/TourMasterWin-test/`.

## Prerequisites

- [ ] No system Node required when `runtime/node.exe` is present
- [ ] Optional: drop `runtime/postgres/` and `runtime/redis/` per `runtime/README.txt`

## A — First install / portable zip

| # | Step | Expected |
|---|------|----------|
| A1 | Run `start.bat` | Browser opens; console shows port and persistence backend |
| A2 | Open `http://127.0.0.1:3000/api/health` | `ok: true`, `persistence: json` (default) |
| A3 | Director: create tournament, save | Data persists after refresh |
| A4 | Run `backup.bat` | `data/backups/` contains timestamped `db.json` |

## B — Port & single instance (F11b.6)

| # | Step | Expected |
|---|------|----------|
| B1 | Start app on port 3000 | `current-port.txt` shows `3000` |
| B2 | Run `start.bat` again while running | Browser opens; **no second server process** |
| B3 | Bind foreign app to 3000, then `start.bat` | Falls back to 3001; UI shows port hint |
| B4 | QR / LAN URLs in venue UI | Match active port from `VenuePortHint` |

## C — Graceful stop (F10 / F11b.6.3)

| # | Step | Expected |
|---|------|----------|
| C1 | `stop.bat` or tray → Stop | Process exits within ~10s |
| C2 | `POST http://127.0.0.1:PORT/api/admin/shutdown` | `{ ok: true }`, server stops |
| C3 | Restart via `start.bat` | Previous tournament data intact |

## D — WebSocket (optional: `VITE_USE_WS=true`)

| # | Step | Expected |
|---|------|----------|
| D1 | Clock view | Updates via WS; 15s poll fallback if WS down |
| D2 | Floor mobile `/floor?team=…` | Team channel updates |
| D3 | Dealer phone session | Grace badge after disconnect (~120s) |
| D4 | Reconnect banner | Shows during WS reconnect |

## E — Dealer zones (optional: `DEALER_ZONES=true`)

| # | Step | Expected |
|---|------|----------|
| E1 | Configure zones in Dealer Control | Staff assignable to zones |
| E2 | Two operators edit same zone | 409 `ZONE_VERSION_CONFLICT` on stale version |
| E3 | `npm run load-test:zones` | All zone reads OK |

## F — Scale smoke (F7.3)

| # | Step | Expected |
|---|------|----------|
| F1 | Server running | — |
| F2 | `npm run load-test:dealers` | 80/80 OK, p95 under 3000ms on LAN |

## G — PostgreSQL (optional: embedded or `USE_POSTGRES=true`)

| # | Step | Expected |
|---|------|----------|
| G1 | Enable PG, restart | `persistence: postgres` in health |
| G2 | Save tournament | Survives restart |
| G3 | Follow `docs/CHECKLIST-PG-RESTART.md` | No data loss after crash/restart drill |

## H — Redis (optional: `USE_REDIS=true`)

| # | Step | Expected |
|---|------|----------|
| H1 | Start with Redis running | `/api/health` → `redis.connected: true` |
| H2 | Stop Redis mid-session | App continues; `snapshotCache.redisFallback: true` |
| H3 | Concurrent zone mutations | 423 `ZONE_LOCK_BUSY` rare; no corrupt state |

## I — Installer (when Inno Setup available)

| # | Step | Expected |
|---|------|----------|
| I1 | `npm run build:installer` | `release/installer/TourMasterSetup.exe` + portable zip |
| I2 | Install to Program Files | `.installed` marker; data under `%ProgramData%` |
| I3 | Upgrade reinstall | `pgdata` preserved when embedded PG used |

## Sign-off

| Role | Date | Notes |
|------|------|-------|
| Operator | | |
| TD / Director | | |
