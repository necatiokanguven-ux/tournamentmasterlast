# Single-server operations (Phase 3)

**Status:** Operational guide for venue deployment with PostgreSQL.

## Model

```text
One venue PC (server)
  └── Tournament Master (port 3000)
        ├── Director browser (same PC or LAN)
        ├── Floor team phones (LAN WiFi)
        ├── Dealer phones (LAN WiFi)
        └── QR tracking displays (LAN WiFi)
```

Multiple operators connect to **one server** — no multi-pod sync required when using PostgreSQL as source of truth.

## Network

| Item | Recommendation |
|------|----------------|
| Server IP | Static LAN IP (e.g. `192.168.1.50`) |
| Port | **3000** (HTTP API + web UI) |
| PostgreSQL | **127.0.0.1:5433** only — not exposed to LAN |
| Firewall | Allow inbound **3000** on venue LAN profile |

## URLs

Replace `SERVER_IP` with the venue PC address:

- Director: `http://SERVER_IP:3000`
- Floor: `http://SERVER_IP:3000/floor?team=floor-1`
- Dealer check-in: `http://SERVER_IP:3000/dealer/checkin`
- Health check: `http://SERVER_IP:3000/api/health`

## Pre-tournament checklist

1. Start server (`start.bat`, Setup.exe, or `npm run start:pm2`)
2. Confirm `/api/health` → `{ ok: true, persistence: "postgres" | "json" }`
3. Run `pg_dump` backup (PostgreSQL mode) or copy `db.json` (JSON mode)
4. Set `TM_AUTO_OPEN_BROWSER=0` on headless venue server
5. Test clock sync from director machine
6. Test one floor team + one dealer phone on venue WiFi

## 40+ table dry-run

- Use **single operator** for dealer control until Dealer Zone (F6) is enabled
- PostgreSQL handles concurrent reads; writes serialize through repository
- Monitor server CPU during peak entry/seating

## Failover

1. Stop server gracefully (tray / PM2 stop / Ctrl+C once)
2. Copy latest backup (`pg_dump` or `data/pgdata/`)
3. Start on spare laptop with same installer build
4. Restore backup if needed

## Graceful stop & PM2

| Method | When |
|--------|------|
| `stop.bat` | Portable zip — calls `/api/admin/shutdown` on localhost |
| Ctrl+C once | Dev / `start.bat` window |
| `pm2 stop tourmaster` | Production PM2 (`npm run start:pm2`) |
| `pm2 save` | Persist PM2 process list after first start |

Local-only admin APIs (127.0.0.1):

- `GET /api/admin/dashboard` — unified venue snapshot (tables, dealers, WS, Redis)
- `POST /api/admin/shutdown` — graceful stop

## Embedded PostgreSQL (optional)

When `runtime/postgres/` is bundled (Phase 11b installer):

1. `start.bat` initializes `data/pgdata` on first run
2. Credentials written to `data/config/database.json` (never shown to user)
3. Server uses `USE_POSTGRES=true` automatically
4. Without bundled PG, **`db.json` is used** — no PostgreSQL install required

Default install path: **`C:\Tournament Master\`**

## Optional feature flags

| Flag | Default | Purpose |
|------|---------|---------|
| `USE_POSTGRES` | false | PostgreSQL persistence |
| `VITE_USE_WS` | false | WebSocket live updates (client build) |
| `DEALER_ZONES` | false | Multi-zone dealer rotation |
| `USE_REDIS` | false | Snapshot cache + distributed locks |
| `SNAPSHOT_CACHE` | false | In-memory read cache (also on when `USE_REDIS=true`) |
| `WS_RPC_WRITES` | false | WS RPC `clock.sync` write path |
| `DATABASE_READ_URL` | unset | Optional PG read replica (reporting stub) |

When Redis is down, the server falls back to in-memory cache and locks (`/api/health` → `snapshotCache.redisFallback`).

## Related

- [ROADMAP.md](./ROADMAP.md) — phase order
- PostgreSQL restart checklist: [CHECKLIST-PG-RESTART.md](./CHECKLIST-PG-RESTART.md)
- Venue manual test matrix: [CHECKLIST-VENUE-TEST.md](./CHECKLIST-VENUE-TEST.md)
- Installer build: `npm run build:installer` → `release/installer/TourMasterSetup.exe` + portable zip
- `npm run install:inno` — winget Inno Setup 6 (build machine)
- `packaging/README-win.txt` — legacy zip distribution
