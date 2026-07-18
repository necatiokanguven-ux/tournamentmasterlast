# Tournament Master — Dealer Tablet & Floor Modülü Uygulama Planı

**Tarih:** 18 Temmuz 2026  
**Proje:** `C:\claude files\tournamentmasterlast`  
**Durum:** Uygulandı (Faz 0–4)  
**Mimari uyum:** Local server (port 3000), `db.json`, salon WiFi/LAN — turnuva verisi buluta gitmez

---

## 1. Amaç ve kapsam

### 1.1 Amaç
Her masaya dealer tableti bağlayarak:
- Turnuva saati, blind, level, next break ve o masadaki oyuncu/koltuk bilgisini göstermek
- Dealer'ın oyuncuyu sistemden elendirme (bust) yetkisi — **onay dialog zorunlu**
- Call Time (varsayılan 30 sn) ve Player Time (varsayılan 60 sn) sayaçları
- Floor çağrısı — **turnuva saati ekranında alarm yok**; ilgili floor ekibinin cep telefonuna bildirim

### 1.2 Oyuncu elendirme — kritik kurallar
- Tablet, Tables ve Players ekranları **aynı `bustPlayer()` yolunu** kullanır
- Elenmeden önce: **"Oyuncuyu silmek istediğinizden emin misiniz?"** onayı
- Başarılı bust sonrası:
  - Masa koltuğu anında boşalır (Tables)
  - Oyuncu Player listesinde `Eliminated` olur (silinmez)
  - Clock **Live Feed**'de bust görünür + **eliminated.mp3** çalar
- **`deletePlayer()`** masadaki oturmuş oyuncular için kullanılmaz (Clock senkronunu bozar)

### 1.3 Kapsam dışı
- Telegram / bulut push bildirimi
- Turnuva clock ekranında floor alarmı
- Oyuncu QR (`/track`) değişikliği
- Turnuva verisinin VPS/PostgreSQL'e yazılması

---

## 2. Mimari prensipler

| Prensip | Açıklama |
|---------|----------|
| Tek kaynak | Salon PC `db.json` |
| LAN erişim | `http://192.168.x.x:3000` |
| Tablet sadece masa bilir | QR → `tableNumber` |
| Dar write API | Tabletler `/api/save` kullanmaz |
| Floor ekip yönlendirme | `tableNumber` → `floorTeamId` |
| Sayaç local | Call/Player Time sunucuya saniye yazmaz |
| Bust tek yol | `bustPlayer()` + `history.type === 'bust'` |

---

## 3. Modül özeti

```
Salon PC — Local Server :3000 — db.json
├── Director UI (Tables)
│   ├── Masa yönetimi (mevcut)
│   ├── Masa QR popup → /dealer/setup?table=N
│   ├── Floor Setup (ekip, masa ataması, ekip QR)
│   └── Timer Settings (call/player süreleri)
├── Dealer Tablet  /dealer/:tableNumber
├── Floor Phone    /floor?team=floor-1
└── Player Phone   /track (mevcut)
```

---

## 4. QR kod stratejisi

| QR | Konum | URL | Okutan |
|----|-------|-----|--------|
| Oyuncu | Clock | `/track` | Oyuncu |
| Dealer | Tables → masa `[QR]` popup | `/dealer/setup?table=N` | Dealer tableti |
| Floor | Floor Setup → ekip `[QR]` | `/floor?team=floor-1` | Floor telefonu |

Popup: operatör kapatana kadar açık kalabilir; backdrop tıklaması kapatmaz.

---

## 5. Dealer tablet modülü

### 5.1 Layout (%30 / %70)
- **Sol %30:** masa no, koltuk + oyuncu adı
- **Sağ üst %20:** BB, SB, ante, level, next level, next break
- **Sağ alt %80:** dairesel sayaç, Call Time / Player Time, Start/Pause/Reset, Call Floor

### 5.2 Bust (tablet)
1. Koltuk/oyuncu seç
2. Dialog: **"Oyuncuyu silmek istediğinizden emin misiniz?"**
3. Onay → `POST /api/dealer/table/:n/bust/:playerId`
4. Sunucu `bustPlayer()` mantığı — `history` type `bust`

### 5.3 Poll
- `GET /api/dealer/table/:tableNumber` — 2 sn

---

## 6. Call Time & Player Time

| Ayar | Default | Nereden |
|------|---------|---------|
| Call Time | 30 sn | Director Tables (tabletten değil) |
| Player Time | 60 sn | Director Tables |

Renk/ses: yeşil (>10) → 10'da bip + sarı → 5'te bip + kırmızı → 5–1 her saniye bip.  
CALL TIME basınca sıfırla + hemen başlat. Sayaç tamamen tablet local.

---

## 7. Floor sistemi

### 7.1 Floor Setup (Tables)
1. Floor ekip sayısı seç
2. Her ekip: masa ataması (her masa tek ekip)
3. Ekip başına QR popup

### 7.2 Yönlendirme
- Masa 3 floor-call → yalnızca Masa 3'ün atandığı ekip
- Küçük turnuva: 1 ekip, 2 telefon aynı QR → ikisine bildirim
- İlk **Gidiyorum (ack)** kazanır → diğer cihazlarda zil durur, "X müdahale ediyor"

### 7.3 Clock
- Floor çağrısı clock'ta **gösterilmez**

---

## 8. Veri modeli

```typescript
// TournamentSettings
dealerCallTimeSeconds: number;      // 30
dealerPlayerTimeSeconds: number;    // 60
floorTeams: FloorTeam[];

interface FloorTeam {
  id: string;
  name: string;
  tableNumbers: number[];
}

interface FloorCall {
  id: string;
  tableNumber: number;
  tableId: string;
  teamId: string;
  status: "pending" | "acknowledged" | "resolved";
  createdAt: string;
  acknowledgedAt: string | null;
  acknowledgedBy: string | null;
  resolvedAt: string | null;
}
```

---

## 9. API endpoint'leri

### Dealer
- `GET /api/dealer/table/:tableNumber`
- `GET /api/dealer/table/:tableNumber/qr-url`
- `POST /api/dealer/table/:tableNumber/bust/:playerId`
- `POST /api/dealer/table/:tableNumber/floor-call`

### Floor
- `GET/PUT /api/settings/floor-teams`
- `GET /api/floor/teams/:teamId/qr-url`
- `GET /api/floor/calls?teamId=...`
- `POST /api/floor/calls/:id/ack`
- `POST /api/floor/calls/:id/resolve`

### Settings
- `GET/PUT /api/settings/dealer-timers`

---

## 10. Frontend route'ları

| Route | Açıklama |
|-------|----------|
| `/dealer/setup?table=N` | Tablet kurulum |
| `/dealer/:tableNumber` | Dealer ana ekran |
| `/floor?team=floor-1` | Floor mobil |

---

## 11. Uygulama fazları

### Faz 0 — Bust senkron düzeltmesi ✅
- Tables: oturmuş oyuncu silme → `bustPlayer()` + onay dialog
- `deletePlayer()` yalnızca waiting list / kayıt silme için
- Clock Live Feed + ses `bust` event ile tutarlı

### Faz 1 — Altyapı & read-only dealer ✅
- db schema, dealer GET API, tablet layout, masa QR popup

### Faz 2 — Dealer write (bust + floor-call) ✅

### Faz 3 — Call Time / Player Time ✅

### Faz 4 — Floor sistemi (setup, QR, ack) ✅

### Faz 5 — Sertleştirme & test
- Manuel test checklist (operasyon günü)

---

## 12. Açık sorular

1. Waiting list'ten silme: `deletePlayer` mı kalsın?
2. Floor spam süresi: 30 sn?
3. Timer settings: Floor Setup yanında ayrı popup?
4. `floorCalls` geçmiş log tutulsun mu?

---

*Bu plan tournamentmasterlast projesinde uygulanacaktır.*
