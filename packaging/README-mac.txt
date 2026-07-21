Tournament Master — Local Server (Mac)

======================================

This package runs the tournament Mac server required for:

- Tournament data storage
- QR Live Tracking (phones connect via WiFi / local IP)
- License activation and machine ID binding


Requirements

------------

- macOS 12 or newer
- No separate Node.js install required (embedded in the app)


Quick start

-----------

1. Open TourMasterMac.dmg from pokerclup.com/downloads (or release/installer after build)
2. Drag **Tournament Master.app** to Applications
   - First time: right-click the app and choose **Open** (macOS Gatekeeper)
   - Alternative: double-click **start.command** in the app bundle (Terminal mode)
3. Wait — your browser opens http://localhost:3000 automatically (InPrivate/Incognito when supported)
4. Sign in to PokerClup and choose trial, 30-day, or annual license

Optional DMG installer (build on Mac):

  chmod +x packaging/mac/build-dmg.sh
  ./packaging/mac/build-dmg.sh
  -> release/TourMasterMac.dmg


Notes

-----

- Keep the Terminal window open during the tournament
- If port 3000 is already in use, close the other program and run start.command again
- Phones must use the same WiFi as this Mac for QR tracking
- QR URL: http://YOUR-LOCAL-IP:3000/track
- Smart TV venue clock: open Display Manager in the app, copy the Venue Display URL
  (e.g. http://YOUR-LOCAL-IP:3000/display) into the TV browser on the same Wi‑Fi
- ID scan (Gemini): requires internet + valid license; API key is hosted by PokerClup (no local setup)


Support: support@pokerclup.com
