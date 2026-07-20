# Database — PostgreSQL migration plan (Phase 2)

**Status:** `PostgresRepository` implemented behind `USE_POSTGRES=true`. Default remains `JsonFileRepository` + `db.json`.

## Phase 2 storage model

Active PG backend uses **`tournament_document`** (singleton JSONB row) — same shape as `db.json`. Normalized tables in `001_initial.sql` are reserved for future optimization (Dealer Zone, row-level locking).

See [../migrations/002_tournament_document.sql](../migrations/002_tournament_document.sql).

## Connection (Phase 2.8)

- **Production (installer):** credentials auto-generated to  
  `%ProgramData%/TournamentMaster/config/database.json` (Windows) or `./data/config/database.json` (dev)
- **Development override:** `.env.local` → `DATABASE_URL=postgresql://...`
- **Flag:** `USE_POSTGRES=true` (default **false**)
- **Fallback:** if PG unavailable → `JsonFileRepository` + warning log

Example generated config:

```json
{
  "host": "127.0.0.1",
  "port": 5433,
  "database": "tournament_master",
  "user": "tournament_app",
  "password": "<random>",
  "ssl": false
}
```

## Schema overview

See [../migrations/001_initial.sql](../migrations/001_initial.sql).

| Table | Purpose |
|-------|---------|
| `schema_migrations` | Applied migration versions |
| `tournament_meta` | Singleton row: meta version |
| `tournament_settings` | Settings JSON or columns |
| `tournament_clock` | Clock state |
| `players` | Player rows + `version` |
| `tables` | Table metadata + `version` |
| `table_seats` | Seat assignments |
| `history_events` | Activity log source |
| `floor_calls` | Floor queue |
| `payouts` | Payout structure |
| `dealer_rotation_settings` | DC settings |
| `dealer_staff` | Staff JSON + extracted grace/zone columns (Phase 5G.12 shadow sync) |
| `dealer_pool_queue` | Ordered pool |
| `dealer_notifications` | Phone notifications |
| `dealer_work_log` | Work log entries |

## Import

```bash
npm run import:json-to-pg -- db.json
```

Requires `DATABASE_URL` or `database.json` config. Applies migration `004` and syncs `dealer_staff` shadow rows.

## Shadow sync (Phase 5G.12)

Each PostgreSQL save updates `dealer_staff` extracted columns:

| Column | Source field |
|--------|----------------|
| `phone_session_token` | `phoneSessionToken` |
| `phone_device_id` | `phoneDeviceId` |
| `phone_last_seen_at` | `phoneLastSeenAt` |
| `phone_grace_until` | `phoneGraceUntil` |
| `state_before_disconnect` | `stateBeforeDisconnect` |
| `zone_id` | `zoneId` |

Query dealers in grace:

```sql
SELECT id, phone_grace_until, rotation_state
FROM dealer_staff
WHERE phone_grace_until > NOW();
```

## Backup

Venue: `pg_dump` via installer menu (Phase 11b) or documented manual command:

```bash
pg_dump -h 127.0.0.1 -p 5433 -U tournament_app tournament_master > backup.sql
```
