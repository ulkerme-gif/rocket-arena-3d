# ROCKET ARENA 3D — STATUS & TEST REPORT (2026-10-12)

## Bu sürümde
- **Sunucusuz online:** Raspberry Pi / Render / WebSocket sunucusu kaldırıldı. Odayı kuran tablet maçı çalıştırır (`src/net/MatchHost.js`), diğerleri WebRTC ile 4 karakterlik oda koduyla bağlanır (`src/net/PeerTransport.js`, PeerJS).
- **1v1 / 2v2 / 3v3:** Hem botlara karşı hem online. Boş koltuklara bot; maç ortasında katılan botun yerine geçer, çıkanın yerine bot geçer. Botlar takımda sırayla oynar (en yakın atak, diğerleri destek / kale).
- **Dokunmatik v3:** Analog sürüş çubuğu + ZIPLA/BOOST/DRIFT/KAMERA, düğmeler arası kaydırma, antrenmanda sıfırlama düğmeleri. Önceki sürümde `InputManager` dokunmatik tuşlara hiç bağlı değildi; bu yüzden 2 test kırmızıydı ve GitHub Pages yayını yapılmıyordu.

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
