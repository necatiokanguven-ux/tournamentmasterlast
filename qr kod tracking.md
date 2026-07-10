# Tournament Master
# QR Live Tracking - Version 1 Geliştirme Planı

---

# Amaç

QR Live Tracking sisteminin temel amacı oyuncuların turnuva başlangıcında yaşadığı masa ve koltuk bulma problemini ortadan kaldırmaktır.

Büyük turnuvalarda yüzlerce oyuncu aynı anda büyük ekrana bakarak kendi ismini, masa numarasını ve koltuk numarasını aramaktadır.

Bu durum;

- Ekran önünde büyük kalabalık oluşturur.
- Turnuva başlangıcını geciktirir.
- Floor personelinin sürekli oyunculara masa göstermesine neden olur.
- Oyuncuların ilk deneyimini olumsuz etkiler.

Tournament Master bu problemi QR Live Tracking sistemi ile çözmeyi hedeflemektedir.

Oyuncu QR Kodu okutur.

Telefonundan kendi masa ve koltuk bilgisini birkaç saniye içerisinde öğrenir.

Turnuva başladıktan sonra aynı ekran canlı turnuva takip ekranı olarak çalışmaya devam eder.

Öncelik turnuva saatini göstermek değil,

oyuncuyu mümkün olan en kısa sürede doğru masaya yönlendirmektir.

---

# Version 1 Felsefesi

Version 1 mümkün olduğunca basit olacaktır.

Öncelik çalışan ve stabil bir sistem geliştirmektir.

Gereksiz özellik eklenmeyecektir.

Cloud sistemi bu sürümde geliştirilmeyecektir.

Sistem yalnızca Poker Room'un Local WiFi ağı üzerinde çalışacaktır.

---

# Çalışma Senaryosu

1. Turnuva oluşturulur.

2. Oyuncular kayıt edilir.

3. Seat Draw tamamlanır.

4. Oyuncular masalara dağıtılır.

5. Tournament Clock ekranında QR Kod görünür.

6. Oyuncu Poker Room WiFi ağına bağlanır.

7. QR Kodu okutur.

8. Telefonunda QR Live Tracking sayfası açılır.

9. Oyuncu turnuva kayıt sırasında kullanılan adını yazmaya başlar.

10. Sistem yazılan karakterlere göre oyuncuları anlık olarak filtreler.

11. Oyuncu kendi adını seçer.

12. Telefon ekranında büyük puntolarla aşağıdaki bilgiler gösterilir.

- Oyuncu Adı
- Masa Numarası
- Koltuk Numarası

13. Oyuncu doğrudan masasına gider.

14. Turnuva başladıktan sonra aynı ekran canlı turnuva bilgilerini göstermeye devam eder.

---

# Oyuncu Arama

Sistemde tek bir QR Kod bulunacaktır.

QR okutulduğunda sistem oyuncunun kim olduğunu bilemez.

Bu nedenle oyuncu önce kendi adını seçmelidir.

Arama kutusu anlık filtreleme yapacaktır.

Örnek;

Oyuncu yazıyor;

ok

Liste daralıyor.

oka

Liste daha da daralıyor.

okan

İlgili oyuncular listeleniyor.

Oyuncu kendi adını seçiyor.

Arama sırasında "Ara" butonu kullanılmayacaktır.

Filtreleme yazıldıkça otomatik yapılacaktır.

Not:

Tournament Master aynı isimli oyunculara izin vermemektedir.

Aynı isim kayıt edilmeye çalışıldığında Floor personeli oyuncu adını benzersiz hale getirir.

Örneğin;

Okan Güven

Okan Güven1

Bu nedenle oyuncu listesinde her isim benzersiz olacaktır.

---

# Telefon Ekranı

İlk gösterilecek bilgiler;

- Oyuncu Adı
- Masa
- Koltuk

Bu bilgiler ekranın en üstünde büyük puntolarla gösterilecektir.

Alt bölümde ise;

- Turnuva Adı
- Mevcut Level
- Blind Bilgisi
- Sonraki Blind
- Kalan Süre
- Kalan Oyuncu
- Average Stack
- Prize Pool
- Sonraki Break

bilgileri gösterilecektir.

Telefon ekranı sade ve okunabilir olacaktır.

---

# Local Network

Version 1 yalnızca Local Network üzerinde çalışacaktır.

Oyuncular Poker Room'un WiFi ağına bağlanacaktır.

QR Kod Local IP adresini açacaktır.

Örnek;

http://192.168.x.xxx:3000

İnternet bağlantısı gerekmemektedir.

Cloud sistemi bu sürümde geliştirilmeyecektir.

---

# Kullanıcı Yetkileri

Telefon sadece bilgi görüntüler.

Telefon üzerinden hiçbir işlem yapılamaz.

Oyuncular;

- Veri değiştiremez.
- Turnuva yönetemez.
- Ayar değiştiremez.
- Oyuncu ekleyemez.
- Oyuncu silemez.
- Sisteme veri gönderemez.

Telefon yalnızca canlı veriyi okur.

---

# Geliştirme Aşamaları

## Faz 1

Local Live Tracking Server oluştur.

Telefon bağlantısını test et.

---

## Faz 2

QR Kod oluştur.

Telefon doğru sayfayı açabiliyor mu test et.

---

## Faz 3

Oyuncu Arama ekranını oluştur.

Anlık filtreleme çalışıyor mu test et.

---

## Faz 4

Oyuncu seçildiğinde;

Masa

Koltuk

bilgileri gösterilsin.

Test et.

---

## Faz 5

Canlı turnuva bilgilerini ekle.

Telefon otomatik güncellensin.

Sayfa yenilemeye gerek kalmasın.

---

## Faz 6

Tournament Master ile tam entegrasyonu tamamla.

Gerçek turnuva senaryosu ile test et.

---

# Cursor Agent Kuralları

Her faz ayrı geliştirilecektir.

Her faz tamamlandıktan sonra durulacaktır.

Kullanıcı onayı alınmadan sonraki faza geçilmeyecektir.

Kod mümkün olduğunca sade olacaktır.

Mevcut Tournament Master yapısı korunacaktır.

Gereksiz teknoloji eklenmeyecektir.

Gereksiz karmaşıklık oluşturulmayacaktır.

Öncelik çalışan sistemdir.

---

# Version 1 Dışında Kalanlar

Bu özellikler daha sonraki sürümlerde geliştirilecektir.

- Cloud
- İnternet üzerinden erişim
- Sponsor reklamları
- Push Notification
- Oyuncu profilleri
- Mobil yönetim
- İstatistik ekranları
- Lisans sistemi

---

# Başarı Kriteri

QR Live Tracking başarılı kabul edilecektir eğer;

Bir oyuncu QR Kodu okuttuktan sonra en fazla 5 saniye içerisinde kendi masa ve koltuk bilgisini öğrenebiliyorsa,

ve büyük ekrana bakmadan doğrudan masasına gidebiliyorsa.

Bu hedef gerçekleştirildiğinde Version 1 tamamlanmış kabul edilecektir.