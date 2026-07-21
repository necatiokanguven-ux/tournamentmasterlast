Tournament Master — Embedded Runtime (Phase 11b)

Place optional bundled binaries here before building the customer zip/installer:

  runtime/
    node.exe          Node.js 20+ Windows (required for customer builds)
    mac-arm64/node    Node.js 20+ Apple Silicon (macOS .app / DMG)
    mac-x64/node      Node.js 20+ Intel Mac (macOS .app / DMG)
    postgres/         Portable PostgreSQL 15+ Windows binaries
      bin/
        pg_ctl.exe
        initdb.exe
        psql.exe
        postgres.exe
    redis/            Optional portable Redis
      redis-server.exe

When present, start.bat will:
  1. Use runtime\node.exe instead of system Node
  2. Initialize data\pgdata on first run (localhost-only, port 5433)
  3. Write data\config\database.json with auto-generated credentials
  4. Set USE_POSTGRES=true for the server process
  5. Start Redis on 127.0.0.1:6379 when runtime\redis is bundled (USE_REDIS=true)

When runtime\postgres is missing, the server uses db.json (default).

Data directory (portable zip):  .\data\
Data directory (installer):     %ProgramData%\TournamentMaster\data\

Do NOT commit PostgreSQL/Redis binaries to git — the installer pipeline copies them here.

Build customer packages (embedded Node, outputs in release/installer/):
  npm run build:packages

Stage embedded Node only:
  npm run stage:runtime
