# Rocket Arena 3D — Tabletten oda + 2v2/3v3 + dokunmatik çubuk

Bu güncelleme mevcut GitHub Codespaces repository'sinin **üzerine** uygulanır.
Eskileri elle silme, repository'yi yeniden oluşturma; aşağıdaki komutlar her şeyi yapar.

## Ne değişti

- **Raspberry Pi ve Render tamamen kaldırıldı.** Odayı kuran kişinin tableti maçı çalıştırır, diğerleri 4 karakterlik oda koduyla katılır. Sunucu adresi girmek yok.
- **1v1 / 2v2 / 3v3:** Ana menüde botlara karşı, online'da oda boyutu olarak seçilir. Boş yerlere bot geçer. Maç ortasında gelen botun yerine geçer, çıkanın yerine bot geçer.
- **Dokunmatik kontroller düzeltildi ve yenilendi.** Önceki yamada `InputManager.js` dokunmatik tuşlara hiç bağlanmamıştı. Bu yüzden tuşlar oyunda çalışmıyordu, 2 test kırmızıydı ve GitHub Pages yeni sürümü hiç yayınlamıyordu. Artık sol başparmakla analog sürüş çubuğu, sağda ZIPLA / BOOST / DRIFT / KAMERA var.
- Botlar 2v2/3v3'te sırayla oynar: en yakın olan topa gider, diğerleri destek ve kale.

## iPad / Safari / GitHub Codespaces'te uygulama

1. `rocket-arena-tablet-oda-patch.zip` dosyasını iPad'in Dosyalar uygulamasına indir.
2. Codespaces'i aç, soldaki Explorer'da repository'nin en üst klasörünü seç.
3. Explorer'daki `...` > `Upload Files` ile ZIP'i repository'nin köküne yükle.
4. Terminal > New Terminal ile terminal aç ve şunları çalıştır:

```bash
cd "$(git rev-parse --show-toplevel)"
unzip -o -q rocket-arena-tablet-oda-patch.zip
rm rocket-arena-tablet-oda-patch.zip
git rm -r -q --ignore-unmatch server render.yaml scripts/install-pi-service.sh README-PI-START-HERE.txt docs/RASPBERRY_PI_ONLINE.md src/online/connectionUrl.js tests/smoke/browser-smoke.mjs rocket-arena-ipad-ready.zip IPAD_TOUCH_V2_KURULUM.md
git add -A
git commit -m "Online: tabletten oda kodu, 2v2/3v3, dokunmatik cubuk; Pi ve Render kaldirildi"
git push
```

5. GitHub > **Actions**: `Deploy Rocket Arena to GitHub Pages` işleminin yeşil olmasını bekle (2-3 dakika).
6. iPad Safari'de oyunu yenile. Eski sürüm gelirse adresin sonuna `?v=3` yaz.
7. İsteğe bağlı: Safari'de **Paylaş → Ana Ekrana Ekle**. Böylece oyun Safari çubukları olmadan tam ekran açılır, alttaki tuşlara Safari'nin çubuğu karışmaz.

İstersen push'tan önce Codespaces'te kontrol edebilirsin: `npm ci && npm test && npm run build && npm run test:smoke`.

## Online nasıl oynanır

1. Herkes oyunda **ONLINE · ARKADAŞLARLA**'ya girer.
2. Biri **ODA BOYUTU**'nu seçer (1V1 / 2V2 / 3V3) ve **ODA KUR**'a basar. Ekranda büyük harflerle oda kodu çıkar.
3. Diğerleri kodu **ODA KODU** alanına yazıp **ODAYA KATIL**'a basar. Daha kolayı: kurucu **DAVET LİNKİNİ PAYLAŞ** ile linki WhatsApp/Mesajlar'dan gönderir; link açılınca kod hazır gelir.
4. Oda dolunca maç kendiliğinden başlar. Kurucu **MAÇI BAŞLAT** ile beklemeden de başlatabilir; eksik yerlere bot geçer.
5. Maç bitince **TEKRAR MAÇ** düğmesi sadece kurucuda çıkar.
6. Kurucu **ÇIK** veya **ODAYI KAPAT** derse oda herkes için kapanır. Misafir çıkarsa yerine bot geçer, maç devam eder; aynı kodla geri dönebilir.

## Dokunmatik kontroller (klavyesiz)

- **Sol başparmak:** Ekranın sol alt yarısında herhangi bir yere dokun; çubuk oraya gelir.
  - Yukarı it: gaz (azıcık itmek tam gaz). Aşağı çek: geri vites.
  - Sağa/sola: dönüş. Tam sağa/sola + hafif yukarı: tam dönüşte tam gaz.
  - Havada: yukarı/aşağı burnu eğer.
- **Sağ başparmak:** BOOST (turuncu, sağ alt), ZIPLA (mavi), DRIFT, KAMERA.
  - Parmağını kaldırmadan BOOST'tan ZIPLA'ya kaydırabilirsin.
  - Havada ZIPLA'ya tekrar bas: takla (yönü çubuk belirler).
  - DRIFT basılıyken çubuğu sağa/sola it: havada döndürme.
- **Serbest antrenman:** sol üstte ARABA ↺ ve TOP ↺.
- Klavye bağlıysa sağ üstteki **🎮 TUŞLARI GİZLE** ile ekran tuşlarını kapat; tercih hatırlanır.

## Bilmen gerekenler

- **İnternet gerekir**, ama sadece tabletlerin birbirini bulması için (PeerJS'in ücretsiz eşleştirme servisi). Maç verisi doğrudan tabletler arasında gider. En düşük gecikme aynı Wi-Fi'da olur; farklı evlerden de çoğu ağda çalışır.
- **Kurucu tablet:** Safari açık, oyun ekranda kalmalı. Uygulamadan çıkarsa veya ekran kilitlenirse maç herkes için donar; 8 saniye sonra misafirlerin bağlantısı düşer. Maç sırasında ekranın kendiliğinden kararmaması istenir, ama Düşük Güç Modu'nda iPad buna izin vermeyebilir.
- **3v3'te** kurucu tablet 6 arabanın fiziğini hesaplar ve 5 kişiye veri gönderir. Eski iPad'lerde ısınma/yavaşlama olursa **Ayarlar → Gölgeler**'i kapat.
- Bot zorluğu, kurucunun **Ayarlar → Bot zorluğu** seçimidir.
- Misafir ekranında gol patlaması / boost izi efektleri yok (önceki online sürümde de yoktu).

## Sorun giderme

- **"Bu kodla açık bir oda bulunamadı"**: Kod yanlış ya da kurucunun oyun ekranı kapandı.
- **"Oyun sürümleri farklı"**: Bir tablette eski sürüm önbellekte. İki tablette de sayfayı yenile (`?v=3`).
- **"Eşleştirme servisine ulaşılamadı"**: İnternet bağlantısını kontrol et.
- **"Tabletler arasında doğrudan bağlantı kurulamadı"**: İki cihazı aynı Wi-Fi'a bağla. Bazı okul/kurum ağları doğrudan bağlantıyı engeller.
- **Dokunmatik tuşlar görünmüyor**: Actions yeşil mi? Sayfayı yenile. Tuşlar menüde gizlidir, maç başlayınca çıkar. Sağ üstte **🎮 TUŞLARI GÖSTER** yazıyorsa ona bas.

## Test durumu

- 77 otomatik test ve sunucusuz 2v2 smoke testi geçiyor.
- Ayrıca online sayfası ve ana oyun bir tarayıcı simülasyonunda (jsdom, gerçek fizik) çalıştırıldı. Denenenler: oda kurma, kodla katılma, hatalı kod mesajları, maçı başlatma, misafir çıkınca bot devri, odayı kapatma, 3v3 botlara karşı ve sadece dokunmatik çubukla sürüş.
- **Gerçek iPad'de ve iki gerçek cihaz arasında denenmedi.** Grafik çizimi, dokunmatik his ve gerçek WebRTC bağlantısını ilk oyunda kontrol et; bir sorun olursa ekrandaki mesajı ve ne yaptığını yaz.
