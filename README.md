# Rocket Arena 3D

Tarayıcıda çalışan, Rocket League'den ilham alan özgün 3D araba futbolu (Three.js + Rapier).
GitHub Pages'te yayınlanır. **Hiçbir sunucu gerekmez**: Raspberry Pi, Render veya Mac açık olmak zorunda değil.

- Kurulum / güncelleme: [TABLET_ODA_KURULUM.md](TABLET_ODA_KURULUM.md)
- GitHub Pages ilk kurulum: [GITHUB_PAGES_KURULUM_TR.md](GITHUB_PAGES_KURULUM_TR.md)

## Oyun modları

- **Botlara karşı:** 1v1, 2v2 veya 3v3. Takım arkadaşların ve rakiplerin bot. Seçim tarayıcıda hatırlanır.
- **Online · arkadaşlarla:** Biri tabletinde 1v1 / 2v2 / 3v3 oda kurar, diğerleri 4 karakterlik oda koduyla (veya davet linkiyle) katılır. Boş yerlere bot geçer. Maç sırasında katılan biri bir botun yerine geçer; çıkan oyuncunun yerine bot geçer, maç durmaz.
- **Serbest antrenman.**
- **Garaj · kaplama:** Gövde rengi, desen (düz, şerit, iki renk, alev, dama, kamuflaj, şimşek), desen rengi, numara ve kapılara parmakla çizim. Canlı 3D önizleme; online maçlarda herkes senin kaplamanı görür. Takım rengi yandaki ışıklarda ve isim etiketinde kalır.
- **İsim etiketleri:** Diğer arabaların üstünde oyuncu adı (botlarda `BOT`), takım rengiyle.

## Online nasıl çalışır

- Odayı kuran tablet "geçici sunucu"dur: fizik, skor, kurallar ve botlar o tablette çalışır (`src/net/MatchHost.js`). Kurucunun kendi arabası doğrudan simülasyondan çizilir, gecikmesi yoktur.
- Tabletler WebRTC ile doğrudan bağlanır (`src/net/PeerTransport.js`, PeerJS). Birbirlerini bulmak için PeerJS'in ücretsiz eşleştirme servisi (0.peerjs.com) **yalnızca bağlantı kurulurken** kullanılır; maç verisi oradan geçmez.
- Oda kodu, kurucunun eşleştirme servisindeki adresidir (`src/net/roomCode.js`). Kodlarda 0/O, 1/I/L yoktur.
- Misafirler kontrol gönderir, kurucudan saniyede 60 durum alır (3v3'te 40). Tüm arabalar ve top, kurucunun simülasyon saatine göre yerleştirilip pürüzsüz oynatılır; Wi-Fi dalgalanması titreme yapmaz (`src/online/SnapshotTimeline.js`, `src/online/RemoteGameView.js`).
- Doğrudan bağlantı kurulamayan ağlar için aracı sunucu (TURN) `src/config/network.js` dosyasından ayarlanır (ücretsiz ExpressTURN hesabı; adımlar `TABLET_ODA_KURULUM.md` içinde). Lobideki **BAĞLANTIYI TEST ET** ağın ne izin verdiğini gösterir.
- Kurucu Safari'den çıkarsa veya ekranı kilitlerse maç herkes için durur; kurucu odayı kapatınca oda biter.

## iPad'de klavyesiz oynama

| Kontrol | Nasıl |
| --- | --- |
| Sür | Sol başparmağı ekranın sol altına koy; çubuk oraya gelir. **Yukarı = gaz, aşağı = geri, sağa/sola = dön.** Havada yukarı/aşağı burnu eğer. |
| ZIPLA | Sağdaki mavi düğme. Havada tekrar bas: takla (yön çubuktan). |
| BOOST | Sağ alttaki turuncu düğme. Parmağını kaldırmadan ZIPLA'ya kaydırabilirsin. |
| DRIFT | Yerde drift; havada çubukla birlikte döndürme (air roll). |
| KAMERA | Top kamerası aç/kapat. |
| ARABA ↺ / TOP ↺ | Sadece serbest antrenmanda (sol üst). |

Klavye bağlıysa sağ üstteki **🎮 TUŞLARI GİZLE** ile ekran tuşları kapanır; tercih hatırlanır.
İpucu: Safari'de **Paylaş → Ana Ekrana Ekle** ile Safari çubukları olmadan tam ekran oynanır.

## Klavye

| Tuş | İşlev |
| --- | --- |
| W / S | Gaz / geri |
| A / D | Sola / sağa dön |
| Space | Zıplama, tekrar basınca ikinci zıplama / flip |
| Sol Shift | Boost |
| Sol Ctrl | Drift / serbest air roll |
| Q / E | Air roll |
| C | Top kamerası |
| Esc veya P | Pause / devam (tek oyunculu) |
| R / T | Serbest antrenmanda arabayı / topu sıfırla |
| H | Debug göstergesi |

Gamepad desteği `InputManager` üzerinden sağlanır.

## Geliştirme

```bash
npm ci
npm test            # Node testleri (fizik, kurallar, bot, oda sistemi, dokunmatik)
npm run build       # dist/ (GitHub Pages)
npm run test:smoke  # build + sunucusuz 2v2 oda uçtan uca
npm run dev         # Vite geliştirme sunucusu
```

Teknik notlar: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/INTERFACES.md](docs/INTERFACES.md), [docs/STATUS_AND_TESTS.md](docs/STATUS_AND_TESTS.md).
