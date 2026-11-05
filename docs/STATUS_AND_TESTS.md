# ROCKET ARENA 3D — STATUS & TEST REPORT (2026-10-12)

## Low-poly arabalar, top ölçeği (2026-11-05, ikinci yama)
- GT-R / Cayman GT4 kaldırıldı; low-poly paketten 22 araba (kamyon, traktör ve römorklu pikap hariç) orijinal doku ve modeliyle eklendi (`public/cars/cars.glb`, ~1,8 MB; `thumbs.webp`).
- Ölçek: önceki arabalar topun yanında çok küçüktü (1,45 × 0,6 × 0,42 m). Şimdi sedan 1,9 m (≈ top çapı), arabalar 1,8–2,05 m uzun, 0,54–0,80 m yüksek. Her arabanın hitbox'ı ve tekerlekleri kendi modelinden ölçülür (`carCatalog.js`, `carPhysics.js`); motor, boost, zıplama ve direksiyon herkeste aynı.
- Takım rengi: arabanın altında mavi / turuncu ışık. Garaj: resimli araba ızgarası.
- Düzeltme: misafir ekranında tekerlekler 5 cm gövdeye gömülü çiziliyordu (statik arabada süspansiyon dinlenme değeri yanlıştı).
- Yeni / güncel testler: `cars` (22 araba, topa göre boyut, model = hitbox, tekerlekler yerde ve fizikteki yerinde, araba başına fizik ile dinlenme yüksekliği ve sürüş, maç ortasında katılan oyuncunun hitbox'ı, takım ışığı, paylaşılan modeller).

## Gerçek arabalar + yeni garaj (2026-11-05)
- Eski düşük poligonlu araba ve kaplama / çizim düzenleyicisi kaldırıldı. Yerine iki gerçek model: Nissan GT-R Nismo (1,37 M → ~18,6 bin üçgen, 391 KB) ve Porsche 718 Cayman GT4 (2,9 M → ~41 bin üçgen, 735 KB), `public/cars/*.glb`.
- Tekerlekler ayrı parçalar: dönme, direksiyon ve süspansiyon fizikten okunur; kaliperler dönmez. Boya takım rengindedir.
- Garaj artık araba seçici (liste + döner platform). Seçim online'da `car` olarak gider; protokol sürümü 4.
- Yeni testler: `cars` (dosya boyutu, üçgen ve çizim çağrısı bütçesi, tekerlek konumları, takım boyası, lastiklerin yere değmesi, paylaşılan modellerin silinmemesi, yedek kutu araba). `online-integration`: roster'da araba seçimi.

## Bu sürümde
- **Sunucusuz online:** Raspberry Pi / Render / WebSocket sunucusu kaldırıldı. Odayı kuran tablet maçı çalıştırır (`src/net/MatchHost.js`), diğerleri WebRTC ile 4 karakterlik oda koduyla bağlanır (`src/net/PeerTransport.js`, PeerJS).
- **1v1 / 2v2 / 3v3:** Hem botlara karşı hem online. Boş koltuklara bot; maç ortasında katılan botun yerine geçer, çıkanın yerine bot geçer. Botlar takımda sırayla oynar (en yakın atak, diğerleri destek / kale).
- **Dokunmatik v3:** Analog sürüş çubuğu + ZIPLA/BOOST/DRIFT/KAMERA, düğmeler arası kaydırma, antrenmanda sıfırlama düğmeleri. Önceki sürümde `InputManager` dokunmatik tuşlara hiç bağlı değildi; bu yüzden 2 test kırmızıydı ve GitHub Pages yayını yapılmıyordu.

## Akıcılık + isim etiketi + garaj (2026-10-12, üçüncü yama)
- Misafir tarafındaki takılma: snapshot'lar varış zamanına göre oynatılıyordu ve kendi araban sürekli düzeltilen kaba bir tahminle çiziliyordu (kamera da onunla sarsılıyordu). Yeni zaman çizelgesi kurucunun simülasyon saatini kullanıyor; snapshot hızı 30 → 60/s (3v3: 40/s). Simülasyonda (Wi-Fi gecikme dalgalanması + kurucu kare dalgalanması) görünür takılan kare oranı %20-36'dan ~%0'a indi, temiz ağda gecikme ~114 ms'den ~53 ms'ye düştü.
- İsim etiketleri, GARAJ (kaplama düzenleyici, canlı 3D önizleme, parmakla çizim), kaplamaların online paylaşımı.
- Protokol sürümü 3 (eski sürümle katılan tablete "sayfayı yenile" denir).
- Yeni testler: `online-timeline`, `skins` (UV yönü dahil), `name-tags`, roster'da kaplama. Garaj, kaplamalı host/misafir oturumu ve etiketler tarayıcı simülasyonunda da denendi.

## Bağlantı güncellemesi (2026-10-12, ikinci yama)
- İlk gerçek denemede misafir tablette "zaman aşımı" görüldü. Sebep: PeerJS'in ücretsiz TURN sunucuları kapatılmış; doğrudan bağlantı kurulamayan ağlarda yedek yol yoktu.
- ICE listesi artık `src/config/network.js` içinden (STUN + isteğe bağlı TURN). Hatalar ayrıştırıldı: oda yok / kurucu yanıt vermedi / ağ yolu yok / eşleştirme servisi yok.
- Lobiye **BAĞLANTIYI TEST ET** eklendi. Ekran uyanık tutma isteği artık dokunuş anında yapılıyor (Safari kuralı).
- `network-config` testleri ve sahte aracıda "kurucu yanıt vermiyor" / "ağ yolu yok" senaryoları eklendi.

## Otomatik testler (`npm test`, Node 22)
- `physics`, `rules`, `arena`, `loop`, `bot` — mevcut fizik/kural/bot testleri (değişmedi).
- `bot-team` — takım rolleri (2v2 başlama vuruşunda takım başına tek bot topa gider), 30 sn 3v3 bot maçı kararlılığı.
- `online-integration` — oda doldurma, 1v1 otomatik başlama, 3v3 dengeli takım ataması, kurucunun erken başlatması, maç ortası katılma/ayrılma (bot devri), 30 Hz snapshot, input ACK, eski input zaman aşımı, sadece kurucu tekrar maç, flood/çöp paket koruması.
- `p2p-transport` — sahte PeerJS aracıyla: oda kodu kaydı, dolu kodda yeni kod, olmayan oda hatası, aracı kesintisi, sessiz bağlantıyı düşürme, ICE hatası.
- `online-protocol` — input temizleme, isim, paket ayrıştırma, oda kodu üretimi/normalleştirme/davet linki.
- `touch-controls`, `ipad-input-integration` — çubuk eşlemesi, yüzen çubuk, çoklu dokunuş, düğmeden düğmeye kaydırma, gizle/göster, klavyeye geçiş, takılı kalan girdi olmaması.
- `online-assets`, `pages-hosting`, `frontend` — dosya/DOM/import sözleşmeleri, Pi/Render kalıntısı olmaması, lockfile.
- `npm run test:smoke` — production build içeriği + sunucusuz 2v2 oda uçtan uca (kurucu + 2 misafir + 1 bot).

## Tarayıcı simülasyonu (jsdom, repo dışında çalıştırıldı)
`online-main.js` ve `App.js` gerçek DOM olayları ve gerçek Rapier fiziğiyle (WebGL çizimi taklit edilerek) çalıştırıldı:
kurucu akışı (2v2 oda, kadro, maçı başlatma, misafir girdisi/ACK, misafir çıkınca bot, odayı kapatma),
misafir akışı (davet linki, hatalı/olmayan kod mesajları, 1v1 otomatik başlama, maç sonu, kurucu kapatınca lobiye dönüş),
tek oyunculu 3v3/2v2/antrenman ve sadece dokunmatikle sürüş (çubuk + BOOST ile 1,5 sn'de ~16 m/s). Konsol hatası yok.

## Doğrulanamayanlar
- Gerçek iPad Safari'de WebGL görüntüsü, dokunmatik his ve gerçek WebRTC bağlantısı (iki gerçek cihaz) burada test edilemedi.
- PeerJS'in ücretsiz eşleştirme/TURN servisinin erişilebilirliği dış bir bağımlılıktır.
- 3v3'te kurucu tablet 6 arabanın fiziğini hesaplar ve 5 misafire veri gönderir; eski iPad'lerde performans ölçülmedi (Node'da tik başına ~0,2 ms).
