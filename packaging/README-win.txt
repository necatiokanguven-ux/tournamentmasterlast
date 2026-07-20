Tournament Master — Local Server (Windows)

============================================

This package runs the tournament PC server required for:

- Tournament data storage
- QR Live Tracking (phones connect via WiFi / local IP)
- License activation and machine ID binding


Requirements

------------

- Windows 10/11
- Node.js 18 or newer (https://nodejs.org/)


Quick start

-----------

1. Extract TourMasterWin.zip to a folder on your tournament PC
2. Double-click start.bat
3. Wait — your browser opens http://localhost:3000 automatically
4. Sign in to PokerClup and choose trial, 30-day, or annual license

No PostgreSQL install is required. The server uses db.json by default.
If the installer bundled runtime\postgres, PostgreSQL starts automatically on port 5433.


Notes

-----

- Keep the start.bat window open during the tournament
- Run backup.bat before major changes — copies db.json / pg_dump to data\backups\
- Run stop.bat for graceful shutdown (or close start.bat window)
- If port 3000 is already in use, `start.bat` tries **3001** or opens browser if Tournament Master is already running
- Phones must use the same WiFi as this PC for QR tracking
- QR URL: http://YOUR-LOCAL-IP:PORT/track (PORT is 3000 or 3001 — see start.bat window)
- Smart TV venue clock: open Display Manager in the app, copy the Venue Display URL
  (e.g. http://YOUR-LOCAL-IP:PORT/display) into the TV browser on the same Wi‑Fi
- ID scan (Gemini): requires internet + valid license; API key is hosted by PokerClup (no local setup)


Support: support@pokerclup.com
