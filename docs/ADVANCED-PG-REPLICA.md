# PostgreSQL read replica (F8.2 — future)

**Status:** Not implemented. Tournament Master uses a single PostgreSQL instance per venue.

## When to adopt

- Central reporting warehouse separate from live venue writes
- Multi-venue analytics without touching production tournament DB

## Planned approach

1. Venue server remains **primary** (port 5433, localhost)
2. Optional `DATABASE_READ_URL` for read-only reporting queries (stub wired — `getOptionalReadPool()`)
3. Repository read path: `get()` from primary; analytics endpoints may use replica when configured
4. No replica required for normal venue operation

## Current behavior

All reads and writes go through the primary repository (`JsonFileRepository` or `PostgresRepository`).

See [ROADMAP.md](./ROADMAP.md) F8.2.
