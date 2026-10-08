## GitHub Pages + Render kurulumu

**Tarayici uzerinden, Mac ya da Raspberry Pi olmadan yayina almak icin:** [GITHUB_PAGES_KURULUM_TR.md](GITHUB_PAGES_KURULUM_TR.md)

GitHub Pages sadece frontend'i barindirir. Online 1v1 icin Render veya Raspberry Pi gibi ayri bir Node/WebSocket server gereklidir.

---

# Online Raspberry Pi sürümü (2026-10-08)

**Bu pakette Raspberry Pi 4B (8 GB) için ilk çevrimiçi 1v1 prototipi eklendi.**

- `online.html` / `src/online-main.js`: aynı oda koduyla iki tarayıcının bağlanması için giriş, HUD ve üç boyutlu görüntü.
- `server/server.js` / `server/rooms.js`: merkezi Rapier fiziği, 1v1 oda yönetimi ve WebSocket iletişimi.
- `scripts/install-pi-service.sh`: Pi üzerinde Mac olmadan sistem servisi kurmaya yardımcı betik.
- **Kurulum: [docs/RASPBERRY_PI_ONLINE.md](docs/RASPBERRY_PI_ONLINE.md)**. Pi'de Node.js 22.12+; `npm ci && npm test && npm run build && npm start`.

**Dikkat:** Yeni ağ modu henüz Raspberry Pi'de veya gerçek tarayıcıda test edilmedi. 60 Hz sunucu, 20 Hz durum mesajı, 30 Hz input; otomatik eşleştirme/rating, gecikme telafisi ve tam profesyonel çok oyunculu oyun özellikleri henüz yok. Aşağıdaki README bir önceki *tek oyunculu* sürüme aittir.

---

# Rocket Arena 3D — Browser-entry integration (2026-10-08)

**Status:** Claude'un WIP simülasyonunun üzerine web giriş noktası, 3D sahne bağlantısı,
menüler, HUD, pause, maç sonu ve ayarlar eklendi. Bu sürüm henüz bir gerçek tarayıcıda
çalıştırılarak doğrulanmadı. Kaynak kodunun sözdizimi ve statik frontend sözleşmeleri
kontrol edildi; gerçek WebGL smoke testi Mac'inde yapılmalı. **Tamamlanmış oyun diye kabul etme.**

## Mac'te çalıştırma

1. Node.js **20.19+** veya uyumlu güncel 22 LTS sürümü kur.
2. Bu ZIP'i aç, Terminal ile içindeki `rocket-arena` klasörüne geç (`package.json` burada).
3. Şu komutları çalıştır:

   ```bash
   npm ci
   npm test
   npm run dev
   ```

4. Terminal'de görünen adresi (normalde `http://127.0.0.1:5173/`) Chrome veya Safari'de aç.
5. **1V1 · BOTA KARŞI** veya **SERBEST ANTRENMAN** butonuna bas.

Üretim paketini denemek için: `npm run build` ve `npm run preview`.

> Bilgi: Bu çalışma ortamında npm paket kayıt sunucusunun DNS adresi çözümlenemediği
> için bağımlılıkları kurup `npm test`, `npm run build` veya tarayıcı testi çalıştıramadım.
> Claude'un orijinal paketindeki 28 test geçme iddiasını bu ortamda yeniden doğrulayamadım.
> Node bağımlılıkları gerektirmeyen frontend statik testleri ayrı çalıştırılabilir:
> `node --test tests/frontend.test.js`.

## Klavye kontrolleri

| Tuş | İşlev |
| --- | --- |
| W / S | Gaz / geri |
| A / D | Sağa / sola dön |
| Space | Zıplama, tekrar basınca ikinci zıplama / flip |
| Sol Shift | Boost |
| Sol Ctrl | Drift / serbest air roll |
| Q / E | Air roll |
| C | Top kamerası |
| Esc veya P | Pause / devam |
| R | Serbest antrenmanda arabayı sıfırla |
| T | Serbest antrenmanda topu sıfırla |
| H | Debug göstergesi |

Gamepad desteği InputManager üzerinden sağlanır fakat Safari/PS5 kontrolcüsü ile denenmedi.

## Bu entegrasyonda değişen dosyalar

- `index.html` — tuval, giriş ekranı, maç HUD'u ve menüler
- `src/main.js` — Rapier WASM init, uygulama başlatma ve hata yakalama
- `src/App.js` — oyun döngüsü, simülasyon, 3D görünüm, kamera, bot ve girdi bağlantısı
- `src/styles/main.css` — arayüz stili, responsive temel düzen
- `vite.config.js` — geliştirme sunucusu ve build ayarları
- `tests/frontend.test.js` — statik DOM ID/import kontrat testi
- `docs/ARCHITECTURE.md`, `docs/INTERFACES.md`, `docs/TUNING.md` — sonraki AI entegrasyonları için teknik notlar

Orijinal `src/physics`, `src/arena`, `src/game`, `src/ai`, `src/input`, `src/camera`, `src/visuals`
modüllerinin algoritmalarına dokunulmadı. Orijinal README kopyası:
`docs/CLAUDE_WIP_README.md`.

## Sınırlar ve yapılacaklar

- Gerçek tarayıcıda görsel doğrulama ve sürüş kontrolü **henüz yapılmadı**.
- Build/test paketi, WebGL shader, dokular, mesh ve oyunpad davranışı yerel Mac'te test edilmeli.
- 1v1 bot Claude'un orijinal kural tabanlı botudur; DeepSeek veya başka bir AI tarafından
  geliştirilmiş yeni bir bot değildir.
- Çok oyunculu ağ modu, ses sistemi, resmi Rocket League modelleri ve online servisler yok.
- Farklı makinelerde performans ayarı ve FPS ölçümü yapılmadı.
- Google Fonts'a erişilemezse fallback yazı tipi kullanılır; oyunun çalışması internete bağlı olmamalıdır.

## Sorun çıkarsa

`npm ci` hata verirse Node sürümünü (`node -v`) kontrol et. `npm run dev` başarısız olursa
Terminal hata çıktısını, tarayıcıda siyah ekran varsa Developer Tools konsolunu kopyala.
Bu loglarla hangi dosyada uyumsuzluk olduğu kolayca ayıklanabilir.
