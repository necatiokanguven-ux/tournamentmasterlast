# Dealer phone grace — test matrix (F5G.11)

Default grace window: **120 seconds** (`phoneGrace.ts`).

## Setup

1. Start venue package (`start.bat` or tray launcher)
2. Enable dealer rotation in Dealer Control
3. Assign at least one dealer to a table with phone session active
4. Optional: `VITE_USE_WS=true` rebuild for live WS path

## Test cases

| # | Action | Expected |
|---|--------|----------|
| G1 | Dealer opens phone URL, session starts | `dealer-phone:{id}` channel snapshot shows active session |
| G2 | Dealer closes browser / loses WiFi | WS disconnect → grace begins; operator sees grace badge |
| G3 | Dealer reopens URL within 120s | Session rehydrates; grace cleared; same table assignment |
| G4 | Wait >120s without reconnect | Grace expires; dealer returns to queue pool; table may rotate |
| G5 | Operator assigns another dealer during grace | Assign blocked or warned per product rules |
| G6 | Two phones same dealer ID | Second session rejected or replaces first (no duplicate dealing) |
| G7 | WS down, HTTP poll only | Floor/dealer phone still updates within 15s fallback poll |
| G8 | Server restart during grace | PG mode: grace restored from `tournament_document` + `dealer_staff.phone_grace_until` |

## API smoke

```powershell
# Start session (replace dealerId)
Invoke-RestMethod -Method POST -Uri "http://127.0.0.1:3000/api/dealer-control/phone/session/start" `
  -ContentType "application/json" -Body '{"dealerId":"DEALER_ID"}'

# Rehydrate
Invoke-RestMethod -Method POST -Uri "http://127.0.0.1:3000/api/dealer-control/phone/rehydrate" `
  -ContentType "application/json" -Body '{"dealerId":"DEALER_ID"}'
```

## Sign-off

| Role | Date | Pass/Fail | Notes |
|------|------|-----------|-------|
| Operator | | | |
| TD | | | |
