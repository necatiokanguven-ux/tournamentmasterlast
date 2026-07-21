# Tournament Master — Salon Gereksinimleri ve Kapasite Rehberi

PokerClup · Turnuva salonu kurulum özeti

---

## 1. Sistem nasıl çalışır?

Turnuva **salon bilgisayarında** çalışır (`TourMasterSetup` kurulumu).

```
                    ┌─────────────────────┐
   Dealer tablet ──►│                     │
   Dealer telefon ─►│   SALON PC          │
   Floor telefon ──►│   (Tournament       │◄── Ethernet (kablo) ── Router
   QR telefon ─────►│    Master)          │
   TV saati ───────►│                     │
                    └─────────────────────┘
                              │
                    Salon içi ağ (WiFi/kablo)
                    Turnuva trafiği BURADAN geçer

   Internet (fiber) ──► Sadece: lisans · kimlik taraması · indirme
                       Turnuva akışı internet hızından ETKİLENMEZ
```

**Unutmayın:** 20 Mbps veya 100 Mbps fiber, turnuva günü dealer/QR trafiğini değiştirmez.

---

## 2. Salon bilgisayarı

| | **Minimum** | **Tavsiye edilen** | **Büyük salon (200+)** |
|---|-------------|-------------------|------------------------|
| İşlemci | Intel i3 / Ryzen 3 | Intel i5 / Ryzen 5 | i5 veya üzeri |
| Bellek (RAM) | **8 GB** | **16 GB** | 16–32 GB |
| Disk | **SSD** 256 GB+ | SSD 512 GB | Hızlı SSD |
| Windows | 10/11 (64-bit) | 11 | 11 |
| Bağlantı | **Ethernet (kablo)** | Ethernet | Ethernet **zorunlu** |

- **Disk:** HDD kullanmayın — turnuva verisi sık yazılır.
- **Bağlantı:** Salon PC **WiFi ile değil, kablo ile** router'a bağlansın.

---

## 3. Kapasite sınırları (standart kurulum)

| | **Rahat** | **Üst sınır** | **Önerilmez** |
|---|-----------|---------------|---------------|
| Masa + dealer tablet | 10–20 | 25–30 | 35+ |
| Staff telefon (dealer) | 15–25 | 40–50 | 60+ |
| Floor telefonu | 2–3 | 6 | 8+ |
| QR telefon (aynı anda) | 20–50 | 80–150 | 200+ |
| Director bilgisayar | 1 | 2 | — |
| Salon saati / TV | 1 | 2 | — |

**Oyuncu sayısı:** Tek başına istek sayısını artırmaz. Çok QR telefonu listeyi büyütür. Asıl yük **tablet + staff telefon** sayısındandır.

---

## 4. Salon ağı şemaları

### A — Küçük / orta salon (≈100 oyuncuya kadar)

```
[Modem / Router]
    │
    ├── Ethernet ──────► Salon PC
    ├── Ethernet ──────► TV saati (isteğe bağlı)
    └── WiFi (tek ağ) ───► Tablet, telefon, QR
```

### B — Büyük salon (100+ oyuncu) — tavsiye edilen

```
[Ana router / internet]
    │
    ├── Ethernet ──────► Salon PC  ← sabit IP (ör. 192.168.1.50)
    ├── Ethernet ──────► TV saati
    │
    ├── WiFi-1  "PokerClup-STAFF"     (5 GHz tavsiye)
    │              → Operator, dealer tablet, dealer telefon, floor
    │
    └── WiFi-2  "PokerClup-GUEST"
                   → Sadece oyuncu QR (/track) telefonları
```

### Ağ kuralları

| Kural | Açıklama |
|--------|----------|
| Salon PC kablolu | Sunucu WiFi kesintisinden etkilenmesin |
| Sabit IP | QR ve tablet linkleri değişmesin |
| Staff ≠ Guest | Dealer/floor **GUEST WiFi'ye bağlanmasın** |
| İki WiFi aynı PC'yi görsün | Örnek: `http://192.168.1.50:3000` |
| İkinci modem/AP | Staff WiFi kalitesini artırır; sunucu yükünü azaltmaz |

---

## 5. Internet ne zaman gerekir?

| İş | Salon içi | Internet |
|----|-----------|----------|
| Turnuva, dealer, floor, QR, saat | ✓ | — |
| Lisans | — | ✓ |
| Kimlik taraması (kayıt) | — | ✓ |
| Yazılım indirme | — | ✓ |

**VPS / sunucu:** Turnuva trafiği pokerclup sunucusuna gitmez; turnuva günü sunucu yükü sorunu olmaz.

---

## 6. Turnuva öncesi kontrol listesi

- [ ] `TourMasterSetup` kurulu, lisans aktif
- [ ] Salon PC: SSD, yeterli RAM, **Ethernet**
- [ ] PC'ye **sabit yerel IP** verildi
- [ ] 100+ salon: **STAFF** ve **GUEST** WiFi ayrıldı
- [ ] Tablet ve staff telefonları **STAFF** ağında
- [ ] QR posterleri **GUEST** ağına yönlendiriyor
- [ ] 1 tablet + 1 telefon ile test yapıldı

---

## 7. Özet

| Konu | Ne yapmalı? |
|------|-------------|
| Darboğaz nerede? | Salon PC + salon WiFi |
| Fiber hızı | Turnuvayı etkilemez |
| Salon PC | İyi makine + SSD + **kablo** |
| 100+ salon | İki WiFi: staff / oyuncu QR |
| Limitler | Bölüm 3 tablosuna bakın |

---

*Belge sürümü: 2026 · Tournament Master standart kurulum (JSON, polling modu)*

*PDF yenilemek için: `python docs/generate-salon-gereksinimleri-pdf.py`*
