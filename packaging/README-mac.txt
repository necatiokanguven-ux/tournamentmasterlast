Tournament Master — Local Server (Mac)

======================================

This package runs the tournament Mac server required for:

- Tournament data storage
- QR Live Tracking (phones connect via WiFi / local IP)
- License activation and machine ID binding


Requirements

------------

- macOS 12 or newer
- Node.js 18 or newer (https://nodejs.org/)


Quick start

-----------

1. Extract TourMasterMac.zip to a folder on your tournament Mac
2. Double-click start.command
   - First time: if macOS blocks the file, right-click start.command and choose Open
   - Or in Terminal: chmod +x start.command && ./start.command
3. Wait — your browser opens http://localhost:3000 automatically
4. Sign in to PokerClup and choose trial, 30-day, or annual license


Notes

-----

- Keep the Terminal window open during the tournament
- If port 3000 is already in use, close the other program and run start.command again
- Phones must use the same WiFi as this Mac for QR tracking
- QR URL: http://YOUR-LOCAL-IP:3000/track


Support: support@pokerclup.com
