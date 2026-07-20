# PokerClup ID Scan API (VPS)

Gemini API key lives **only** on this service. Tournament Master salon apps call this API with `licenseKey` + `machineId`; images are not stored.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/id-scan/health` | Service health |
| GET | `/api/id-scan/status?licenseKey=&machineId=` | Gemini + license status |
| POST | `/api/id-scan/scan` | Scan ID image (JSON body) |

### POST `/api/id-scan/scan`

```json
{
  "licenseKey": "...",
  "machineId": "...",
  "machineName": "optional",
  "imageBase64": "...",
  "mimeType": "image/jpeg"
}
```

## Environment

```env
GEMINI_API_KEY=your_key_here
GEMINI_MODEL=gemini-2.5-flash-lite
LICENSE_API_URL=https://api.pokerclup.com/api/licenses
PORT=3010
```

## Deploy on api.pokerclup.com

Mount the router at `/api/id-scan` behind HTTPS (reverse proxy). Set `GEMINI_API_KEY` in server environment only.

## Local dev

```bash
cd vps/id-scan
npm install
cp .env.example .env.local   # add GEMINI_API_KEY
npm run dev
```

Point Tournament Master at local proxy:

```env
ID_SCAN_API_URL=http://127.0.0.1:3010/api/id-scan
```

## Security

- License verified via existing `/api/licenses/verify` before every scan
- Rate limit: 1 scan / 2s per license + machine + IP
- Max image ~6 MB base64
- No image persistence
- Allowed mime: jpeg, png, webp
