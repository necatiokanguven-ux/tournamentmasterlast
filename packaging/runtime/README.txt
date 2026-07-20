Tournament Master — Embedded Runtime (Phase 11b)

Place optional bundled binaries here before building the customer zip/installer:

  runtime/
    node.exe          Node.js 18+ (required for F11b customer builds)
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

Build installer staging:
  npm run build:installer

Compile TourMasterSetup.exe (requires Inno Setup 6):
  packaging\installer\build-installer.ps1
