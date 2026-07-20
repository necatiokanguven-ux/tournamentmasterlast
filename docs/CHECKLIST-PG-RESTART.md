# Tournament Master — PostgreSQL crash/restart consistency checklist (Phase 10.5)

Manual venue test — run after embedded PG or external PostgreSQL setup.

## Prerequisites

- [ ] `USE_POSTGRES=true` and `/api/health` shows `persistence: "postgres"`
- [ ] Tournament has players, tables, and dealer rotation enabled
- [ ] `backup.bat` or `pg_dump` backup taken before test

## Test A — Graceful stop

1. [ ] Start server via `start.bat` or tray launcher
2. [ ] Make a visible change (add player, sync clock)
3. [ ] Run `stop.bat` or tray **Stop Server**
4. [ ] Restart server
5. [ ] Confirm change persisted
6. [ ] Confirm dealer rotation state intact

## Test B — Hard kill (simulate crash)

1. [ ] Start server, note `lastModified` from `/api/data/meta`
2. [ ] Kill Node process from Task Manager (no graceful stop)
3. [ ] Restart server within 30 seconds
4. [ ] Confirm no duplicate history entries
5. [ ] Confirm clock sync reasonable (director may resync)
6. [ ] Confirm `/api/health` ok

## Test C — PostgreSQL restart while app running

1. [ ] Start embedded PG + app
2. [ ] Stop only PostgreSQL (`pg_ctl stop` or kill postgres process)
3. [ ] Attempt save from director — should fail gracefully or fallback per config
4. [ ] Restart PostgreSQL
5. [ ] Restart Tournament Master app
6. [ ] Confirm data matches last successful backup or last save

## Test D — Upgrade preserves data (F2.8.5)

1. [ ] Note `%ProgramData%\TournamentMaster\data\` size and `database.json` exists
2. [ ] Run new installer over old install
3. [ ] Confirm `data\pgdata` and `config\database.json` unchanged
4. [ ] Confirm tournament loads with prior data

## Pass criteria

- No silent data loss
- JSON fallback only when PG explicitly unavailable and flag allows
- Operator sees clear error if save fails mid-outage

## Related

- [OPERATIONS.md](./OPERATIONS.md)
- [DATABASE.md](./DATABASE.md)
