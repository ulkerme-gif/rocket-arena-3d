# Raspberry Pi 4B 8GB — Mac olmadan ONLINE 1v1

**Durum:** Pi'de gerçekten çalıştırılarak doğrulanmamış geliştirme sürümüdür. Orijinal WebGL sürümü de henüz tarayıcı testinden geçmemişti. Modülleri birbirine bağlayan ilk multiplayer prototipidir; tam Rocket League ağ oynanışı kalitesinde değildir.

## Mimari

- Raspberry Pi: Node.js HTTP + `ws` WebSocket sunucusu; tek authoritative Rapier WASM Simulation / oda.
- Tarayıcı: Three.js çizimi, klavye/gamepad girdisi ve görüntü yumuşatma.
- İki oyuncu aynı 3–14 karakterlik oda koduyla buluşur (mavi/turuncu).
- Pi: varsayılan 60 Hz fixed step, 20 snapshot/s, max 4 oda; tarayıcı 30 input/s.
- İstemci araba veya top konumunu sunucuya yollayamaz. Konum, skor ve boost yalnızca sunucudan gelir.
- Sunucu tek Node işlemidir; oda kapanınca simülasyon belleği serbest bırakılır.
- Oda şifreli değildir, kodu bilen başkası bağlanabilir. Sadece tanıdıklarınla paylaş.
- Bağlanan iki kişiden biri ayrılırsa maç kapanır. Oyuncu yeniden bağlanabilir.
- Maç bitince iki oyuncu da TEKRAR MAÇ tuşuna basarsa yeni maç başlar.

## Raspberry Pi'de kurulum (hiç Mac gerekmez)

Bu ZIP'i **başka bir cihazdan SSH/SFTP ile Pi üzerinde bir klasöre** aktarabilirsin; Pi OS Lite üzerinde Chromium bulunmaz; Mac gerekmiyor.

Pi'de Raspberry Pi OS **64-bit** tavsiye edilir. Terminalde `uname -m` komutu `aarch64` göstermeli. Hazır bir Raspberry Pi OS varsa sıfırdan kurmana gerek yok.

1. Pi terminalinde:

   ```bash
   uname -m
   node -v
   npm -v
   ```

   Node.js **22.12+** tavsiye edilir. Yüklü değilse 64-bit Raspberry Pi OS için ARM64 Node 22 kur; resmi Node.js dağıtımından veya nvm'den kurabilirsin. `npm` sürümünün de yüklü olduğundan emin ol.

2. ZIP'i aç ve proje klasörüne gir:

   ```bash
   cd ~/Downloads
   unzip rocket-arena-gemini-reviewed.zip -d ~/rocket-arena-deploy
   cd ~/rocket-arena-deploy/rocket-arena
   ```

3. Paketleri yükle ve derle:

   ```bash
   npm ci
   npm test
   npm run build
   ```

   `npm ci` kilitlenmiş paket sürümlerini indirir. Bu inceleme ortamında DNS/internet erişimi olmadığından bağımlılıklar indirilip tam test veya Vite build yapılamadı. `npm ci` başarısız olursa `npm install` dene ve hata mesajını paylaş.

4. Sunucuyu başlat:

   ```bash
   npm start
   ```

   `http://raspberrypi.local:3000/online.html` adresini aynı ev ağındaki bir tarayıcıdan aç. Yerel isim çalışmıyorsa Pi'nin adresini `hostname -I` komutuyla öğren ve `http://<pi-ip>:3000/online.html` adresini aç.

5. İki ayrı cihaz aynı oyun adresini açsın. İkisinde de oda kodu örneğin `ARENA123` olsun. Odaya gir butonlarına basınca eşleşirler.

**Pi oyunu çizmez.** Oyunun grafikleri bağlantıyı açan cihazda çalışır. Pi sadece 3D fiziği, skor ve ağ haberleşmesini hesaplar. Raspberry Pi'de Minecraft sunucusu da açıksa yük ve gecikme artabilir.

## İnternetten açmak (port yönlendirme olmadan)

Önce aynı ağda 1v1 çalıştığını doğrula. Sonra Pi üzerine **Cloudflare Tunnel `cloudflared`** kurabilirsin. Cloudflare Tunnel normal HTTP ile WebSocket bağlantılarını destekler; modem port açmayı gerektirmez.

`cloudflared` kurulu olduğunda hızlı test komutu:

```bash
cloudflared tunnel --url http://localhost:3000
```

Terminal bir `https://...trycloudflare.com` adresi üretir. Arkadaşın aynı adrese `/online.html` ekleyerek bağlanabilir. Bu geçici bağlantı deneme içindir; sabit alan adı için Cloudflare hesabında kalıcı Named Tunnel kullan.

`cloudflared` binary kurulum yönergeleri: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/

Daha fazla güvenlik için kalıcı hostname erişimini kısıtla / davetiye-şifre sistemi ekle. `ws` bağlantısını direk internete açık HTTP portu üzerinden sunma. Cloudflare tek başına anti-cheat, rate limit her türü, matchmaking, login veya düşük ping garantisi vermez.

## Sunucu otomatik başlasın

İlk yerel test tamamlandıktan sonra Pi'deki proje klasöründe:

```bash
./scripts/install-pi-service.sh
systemctl --user status rocket-arena
sudo loginctl enable-linger "$(whoami)"
```

`loginctl enable-linger` sayesinde kullanıcı giriş yapmamış olsa da user service açılışta çalışır. Günlükleri görmek için: `journalctl --user -u rocket-arena -f`. Önce Terminal'den oynandığını doğrulamadan otomatik servis kurma. Tüm yapı dosyaları Pi üzerinde çalışır, Mac kapalı kalabilir.

## Bilinen eksikler

- Gerçek fizik/browser render/çoklu cihaz uçtan uca testleri henüz yapılmadı.
- İstemci yalnızca sınırlı görsel hareket tahmini ve ACK tabanlı kuyruk temizliği yapar. Rapier fiziğini istemcide tekrar çalıştıran tam prediction/reconciliation henüz YOK. Gecikmede hatalı tahminler ve düzeltmeler görülebilir.
- Oyun fizik koşulları / controller Rocket League birebir değildir.
- Sunucu reconnect edilen maça anında geri alma ve hesap sistemi içermez.
- Lobby yalnızca oda kodu tabanlı, spectators, 2v2, 3v3, sıralama ve kalıcı istatistik yok.
- Varsayılan 60 Hz sunucu ayarını stabil bulduktan sonra `TICK_RATE=120 npm start` ile deneyebilirsin; Pi CPU kullanımını ölç.
- Port `PORT=3000`, oda sınırı `MAX_ROOMS=4` çevre değişkenleriyle ayarlanır. Düşük gecikme için Ethernet bağlantısı önerilir.

## Lokal geliştirme uyarısı

`npm run dev` sadece Vite web sayfasını açar (`:5173`). Çevrimiçi WebSocket `:3000` üzerinden yayınlandığı için, Vite geliştirme sunucusu tek başına **online 1v1 sağlamaz**. Online modu test etmek için `npm run build && npm start` çalıştır, ardından `http://PI_IP:3000/online.html` adresini aç. `npm start` komutunu build olmadan çalıştırmak static dosyalarda 404 verebilir.

Node.js 18 sürümü Vite 8 için desteklenmez. Node.js 22.12+ tercih et, Linux ARM64 ve Node/npm ikilisini kontrol et.
