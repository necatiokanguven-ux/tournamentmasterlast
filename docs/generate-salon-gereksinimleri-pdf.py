#!/usr/bin/env python3
"""Generate salon requirements PDF from docs/salon-gereksinimleri.md (content embedded)."""

from __future__ import annotations

import sys
from pathlib import Path

try:
    from fpdf import FPDF
except ImportError:
    print("Install: pip install fpdf2")
    sys.exit(1)

DOCS = Path(__file__).resolve().parent
OUTPUT = DOCS / "tournament-master-salon-gereksinimleri-tr.pdf"


class SalonPDF(FPDF):
    def __init__(self) -> None:
        super().__init__()
        self._unicode = False
        arial = Path("C:/Windows/Fonts/arial.ttf")
        if arial.exists():
            self.add_font("ArialUni", "", str(arial))
            self._unicode = True

    def font(self, size: int = 11) -> None:
        if self._unicode:
            self.set_font("ArialUni", size=size)
        else:
            self.set_font("Helvetica", size=size)

    def heading(self, text: str, size: int = 14) -> None:
        self.set_text_color(20, 20, 20)
        self.font(size)
        self.set_x(self.l_margin)
        self.multi_cell(self.epw, 7, text)
        self.ln(2)

    def body(self, text: str, size: int = 11) -> None:
        self.set_text_color(45, 45, 45)
        self.font(size)
        self.set_x(self.l_margin)
        self.multi_cell(self.epw, 6, text)
        self.ln(2)

    def mono(self, text: str) -> None:
        self.set_font("Courier", size=8)
        self.set_text_color(30, 30, 30)
        self.set_x(self.l_margin)
        self.multi_cell(self.epw, 4.2, text)
        self.ln(3)

    def footer(self) -> None:
        self.set_y(-14)
        self.font(9)
        self.set_text_color(120, 120, 120)
        self.cell(0, 10, f"PokerClup.com - Sayfa {self.page_no()}", align="C")


def build() -> Path:
    pdf = SalonPDF()
    pdf.set_auto_page_break(auto=True, margin=16)
    pdf.set_margins(16, 16, 16)
    pdf.add_page()

    pdf.heading("Tournament Master", 20)
    pdf.heading("Salon Gereksinimleri ve Kapasite Rehberi", 13)
    pdf.body(
        "Bu belge turnuva gunu sistemin sorunsuz calismasi icin salon bilgisayari, "
        "ag ve cihaz sinirlarini ozetler."
    )

    pdf.heading("1. Sistem nasil calisir?")
    pdf.body(
        "Turnuva salon bilgisayarinda (TourMasterSetup) calisir. Dealer tableti, dealer telefonu, "
        "floor, oyuncu QR ve salon saati — hepsi salon PC'ye baglanir. Bu trafik salon ICINDEDIR; "
        "fiber hiziniz turnuva akisini etkilemez."
    )
    pdf.body("Internet: lisans, kimlik taramasi (kayit), yazilim indirme.")
    pdf.mono(
        "[Salon PC]  <--- dealer, floor, QR, saat (salon ici)\n"
        "[Internet]  <--- lisans, ID scan, indirme"
    )

    pdf.heading("2. Salon bilgisayari")
    pdf.body(
        "Minimum: i3/Ryzen 3, 8 GB RAM, SSD, Win 10/11, Ethernet kablo.\n"
        "Tavsiye: i5/Ryzen 5, 16 GB RAM, SSD 512 GB, Win 11, Ethernet.\n"
        "Buyuk salon: i5+, 16-32 GB RAM, hizli SSD, Ethernet zorunlu.\n"
        "HDD kullanmayin."
    )

    pdf.heading("3. Kapasite sinirlari")
    pdf.mono(
        "                    Rahat      Ust sinir    Onerilmez\n"
        "Masa + tablet       10-20      25-30        35+\n"
        "Staff telefon       15-25      40-50        60+\n"
        "Floor telefon       2-3        6            8+\n"
        "QR telefon          20-50      80-150       200+\n"
        "Director PC         1          2            -\n"
        "Salon saati / TV    1          2            -"
    )
    pdf.body(
        "Oyuncu sayisi tek basina istek sayisini artirmaz. Asil yuk tablet ve staff telefon sayisindadir."
    )

    pdf.heading("4. Salon agi — kucuk / orta salon")
    pdf.mono(
        "[Modem/Router]\n"
        "  |-- Ethernet --> Salon PC\n"
        "  |-- Ethernet --> TV saati\n"
        "  '-- WiFi --> tablet, telefon, QR"
    )

    pdf.heading("5. Salon agi — buyuk salon (100+)")
    pdf.body(
        "Iki WiFi: STAFF (dealer, floor, operator) ve GUEST (sadece oyuncu QR). "
        "Salon PC Ethernet + sabit IP. Staff cihazlari GUEST agina baglanmasin."
    )
    pdf.mono(
        "[Router]\n"
        "  |-- Ethernet --> Salon PC (sabit IP)\n"
        "  |-- Ethernet --> TV\n"
        "  |-- WiFi STAFF --> operator, tablet, dealer tel, floor\n"
        "  '-- WiFi GUEST --> sadece QR telefonlari"
    )
    pdf.body(
        "Ikinci modem/AP staff kalitesini artirir; sunucu istek sayisini azaltmaz."
    )

    pdf.heading("6. Internet ne zaman gerekir?")
    pdf.body(
        "Turnuva/dealer/floor/QR/saat: Hayir (salon ici).\n"
        "Lisans, kimlik taramasi, indirme: Evet."
    )
    pdf.body("Turnuva trafiği VPS/pokerclup sunucusuna gitmez.")

    pdf.heading("7. Turnuva oncesi kontrol listesi")
    for line in [
        "TourMasterSetup kurulu, lisans aktif",
        "Salon PC: SSD, RAM, Ethernet",
        "Sabit yerel IP verildi",
        "100+ salon: STAFF ve GUEST WiFi ayrildi",
        "Tablet/staff telefon STAFF aginda",
        "QR posterleri GUEST agina yonlendiriyor",
        "1 tablet + 1 telefon ile test yapildi",
    ]:
        pdf.body(f"  [ ] {line}")

    pdf.ln(4)
    pdf.body("PokerClup · Tournament Master · 2026 · Standart kurulum (JSON, polling)")

    pdf.output(str(OUTPUT))
    print(f"PDF: {OUTPUT}")
    return OUTPUT


if __name__ == "__main__":
    build()
