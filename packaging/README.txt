Tournament Master — Local Server
================================

This package runs the salon PC server required for:
- Tournament data storage
- QR Live Tracking (phones connect via WiFi / local IP)
- License machine ID binding

Requirements
------------
- Windows 10/11
- Node.js 18 or newer (https://nodejs.org/)

Quick start
-----------
1. Extract this ZIP to a folder on your tournament PC
2. Double-click start.bat
3. Open https://app.pokerclup.com in your browser
4. Go to Settings ^> License Activation and enter your license key

Notes
-----
- Keep start.bat running during the tournament
- Phones must use the same WiFi as this PC for QR tracking
- QR points to http://YOUR-LOCAL-IP:3000/track (not the cloud URL)
- Firewall: allow incoming connections on port 3000 for LAN devices

Support: info@pokerclup.com
