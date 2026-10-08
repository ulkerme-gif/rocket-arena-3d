# GEMINI DEVIR PROMPTU — ROCKET ARENA 3D (2026-10-08)

ROLUN
Sen kidemli bir multiplayer game-engine muhendisi, Three.js/Rapier programcisi, Node.js/WebSocket network muhendisi, oyun AI gelistiricisi ve Raspberry Pi 4B/Linux performans muhendisisin.

GOREVIN
Ekteki `rocket-arena-gemini-handoff.zip` dosyasini ac; icindeki `rocket-arena/` projesinin GERCEK kaynak kodunu incele. Sadece oneriler vermekle kalma: gerekli dosyalari bizzat degistir, testleri calistir, build al ve icinde guncellenmis tum proje olan indirilebilir YENI ZIP uret. Calismayi ayni oyun uzerinde surdur; bastan yazma. Turkce cevap ver. Kapsamli fakat net test raporu ve dokuman ekle.

AMAC
Rocket League'den ilham alan ozgun bir araba-futbol oyunu: tarayicida acilan 3D grafik, saglam fizik, oynanabilir online oda kodlu 1v1, uzaktan baglanan iki oyuncu; Raspberry Pi 4B 8 GB RAM uzerinde Node.js WebSocket server. Raspberry Pi sadece authoritative fizik/oyun/ag sunucusu, 3D goruntu oyuncu cihazlarinda Three.js ile olusturulur.

KISITLAR — TARTISMASIZ
1) MAC KULLANMA. Gelistirme ZIP kaynagi uzerinde, mevcut ortaminda yapilsin. Pi kurulumu en son olacak.
2) Raspberry Pi su an fiziksel olarak erisilemez. Raspberry Pi'ye baglanmaya calisma, canli Pi testi yapilmis gibi raporlama.
3) Pi uzerinde Raspberry Pi OS Lite 64-bit (ARM64), 8 GB RAM var. Formatlama / yeniden OS yukleme YOK.
4) Raspberry Pi'de daha once kurulan Monero miner var. Dosyalarina, servisine, ayarlarina DOKUNMA. Miner deaktif edilmesi daha sonra ayri adimda degerlendirilecek. Su anda minerla ilgili komut, silme veya servis degisikligi yapma.
5) Mevcut oyunun fizik, arena, mac kurallari ve bot davranisini bozma; geri uyumlulugu koru. Tum degisiklikleri testlerle dogrula.
6) Hazir API/SDK oyuna hileli state enjekte etmesin: sunucu authoritative olsun; istemciden sadece kontrollu input alinsin.
7) Yeni ZIP uretmeden 'tamamlandi' deme. Dogrulayamadigin test icin 'test edildi' deme.

GERCEK ZIP ICERIGI (INCELEYEREK TEYIT ET)
- package.json, package-lock.json, Vite, Node.js ESM.
- `src/physics/`, `src/arena/`, `src/game/`, `src/ai/`, `src/config/`, `src/visuals/`, `src/camera/`, `src/input/`.
- `index.html`, `src/App.js`, CSS: tek cihaz/browser oyunu.
- `online.html`, `src/online-main.js`, `src/online/RemoteGameView.js`, `src/online/online.css`: online arayuz ve cizim.
- `server/server.js`, `server/rooms.js`, `server/protocol.js`: HTTP + WebSocket authoritative 1v1.
- `tests/*.test.js`: 41 test tanimi goruldu; fakat kendi ortaminda `npm test` calistirip gecerligi dogrula.
- `docs/RASPBERRY_PI_ONLINE.md`: mevcut kurulum dokumani.
- `docs/CLAUDE_WIP_README.md` tarihsel ve ARTIK ESKI: 'tarayicida acilmaz' iddiasi bu yeni ZIP icin dogru degildir; dokumani yeniden duzenle veya arsiv notuyla isaretle.
- Node.js `>=20.19.0`, tercihen uygun Node 22; scripts `npm ci`, `npm test`, `npm run build`, `npm start`; online sayfa `/online.html`; server PORT varsayilan 3000.

DAHA ONCEKI CALISMA MODU RAPORU — YENI ZIP'E KAYDEDILDIGI GARANTI DEGIL
- Multiplayer ilk surum: oda kodlu 1v1, sunucu kontrollu fizik, skor, rematch, 60 Hz simulation/20 Hz snapshots, 30 Hz input; TCP/WebSocket.
- Sonraki calisma oturumunda `npm ci` ve baslangicta 41 testin basarili oldugu, production build alindigi bildirildi.
- Input validation, sequence/ack, WebSocket baglanti ve oda sinirlari, timestamp tabanli interpolation ve max 100 ms extrapolation uzerinde iyilestirmeler yapildi. ANCAK bu son degisikliklere ait indirilebilir yeni bir ZIP bulunamadi. Bu nedenle mevcut dosyada yoksa kodu gercekten uygulaman gerekir.
- Tam client-side prediction/reconciliation TAMAMLANMADI.
- Bot tarafinda bir duzenleme, 'hareketsiz rakibe gol atabilen bot' testini bozdu; regresyon giderilmeden kabul edilmeyecek. Guncel ZIP'teki botu saglam baseline kabul et, degistirirsen orijinal testi koru.
- Raspberry Pi'de, iki ayri tarayicida ve internetten gercek multiplayer testleri henuz yapilmadi.

GELISTIRME ONCELIKLERI
A) KAYNAGI AC VE BASELINE OLUSTUR
  - ZIP iceriklerini, README ve dependency surumlerini oku.
  - `npm ci`; `npm test`; `npm run build` calistir. Baslangic sonucunu sayilarla raporla.
  - Hangi ozelliklerin gercekte bulunduğunu bul; 'oldugu varsayilan' seyi yeniden yazma.
  - Smoke test scripti eksikse ekle, tarayici ortaminda olanak varsa headless browser ile sayfanin yuklendigini, WebGL baglanti/cizim sikintisini kontrol et. Ortam engellerini acikca belirt.

B) MULTIPLAYER AG GUVENILIRLIGI VE GUVENLIK
  - Server authoritative game state, skor, fizik ve boost; istemci sadece input gonderebilsin.
  - Tum WebSocket message boyutlari, tipleri, numeric araliklar, non-finite sayilar ve protokol eventleri validate edilsin. Rate limit, max room/client sayisi, mesaj ve buffer sinirlari, idle timeout, heartbeat, disconnect cleaning guvenilir olsun.
  - Input sequence number ve server ack sistemi kur; stale/reordered input kabul etme. Input zaman damgalari ve simulated latency/jitter icin uyumlu semantik kullan. Sequence/ack'i client ve server'a ayni anda entegre et.
  - Snapshot'lara monoton artan sim tick/sequence ve uygun server timing metadata ekle. Client interpolation buffer gelistir; extrapolation'i max 100 ms tut ve kaybolan paket durumunda sert teleport/jitter'i azalt. Sadece client tarafinda kozmetik yumusatma olsun, authoritative sonucu degistirmesin.
  - Reconnect/resume gercekci sekilde uygulanabiliyorsa oyuncu slotunun kisa sure tutulmasi, guvenli resume token, timeout ve durum senkronu ekle. Sadece baglantinin yeniden acilmasi ile ayni macin devam ettigi iddiasinda bulunma; kanitla.
  - Jump/dodge tetiklerinin input paket kaybi veya sampling yuzunden yutulmadigini test et.
  - WebSocket Origin/proxy uyumlulugu, URL parse ve dosya sunma path traversal/buyuk dosya savunmalarini dogrula. Genel internette kimlik dogrulama olmadan oda kodu ile erisimin risklerini belgele.
  - Gercek WebSocket ile oda yarat, ikinci oyuncu katilimi, ucuncu oyuncunun reddi, farkli oda izolasyonu, goal/snapshot, rate limit/invalid input, ayrilma/reconnect/rematch senaryolarini otomatik integration test olarak ekle.

C) OYUN, BOT VE UI
  - Fizik/arena/mac kurallari regression testlerini oldugu gibi koru. Bot vs hareketsiz oyuncu gol atma, bot vs bot numerik stabilite testleri kesinlikle gecsin.
  - Oyunu tarayicida gercekten oynanabilir yap: klavye/gamepad, lobby, oda kodu, oyuncu durumu, baglanti kopmasi mesaji, skor, sure, boost, gol, mac sonu ve rematch.
  - Kamera takibi, top kamerası, input gecikmesi, renderer ve GUI hatalarini gider. Once oynanabilirlik, sonra estetik. Mevcut tasarimi koru; gerekli UI/CSS ve ses eklemelerini mevcut mimariye uygun yap.
  - Origin ve network state, rendering, input ve simulation sinirlarini temiz tut.

D) RASPBERRY PI PERFORMANSI VE DEPLOY
  - Pi 4B 8GB ve Raspberry Pi OS Lite ARM64 icin CPU/RAM/garbage allocation ve room lifecycle kontrolu ekle; varsayilan 60 Hz/20 Hz, max 4 room ile basla. Test etmeden 120 Hz garantisi verme.
  - Sunucuyu Pi'nin ekran/grafik ihtiyaci olmadan calisabilir tut. Donanim ARM64 bagimliliklarini kontrol et.
  - Mevcut sisteme dokunmadan son asamada Raspberry Pi kurulumu icin ayri, geri alinabilir ve minimum-degisiklikli komutlar hazirla; herhangi bir komutu Raspberry Pi'de otomatik calistirma.
  - Once yerel ag testi, sonra istege bagli Cloudflare Tunnel (HTTPS/WSS); asla modem port acmayi zorunlu kilma; production security notu ver.
  - Mevcut minerla ilgili hicbir dosya/service/islem degistirme veya otomatik durdurma islemi yapma.

E) SON DOGRULAMA VE TESLIM
  1) `npm ci`, `npm test`, `npm run build` ve gereken integration/smoke testlerini gercekten calistir. Test sayilarini, hatalari ve duzeltmeleri raporla.
  2) Mümkünse localhost uzerinde `npm start` server ac, iki client ile gercek WebSocket 1v1 senaryosu dogrula. Gercek browser rendering ile network protokol testi arasindaki farki acikla.
  3) `README.md`, `docs/RASPBERRY_PI_ONLINE.md`, ve yeni `docs/STATUS_AND_TESTS.md` dosyalarini GERCEK son durumla uyumlu guncelle. Tarihsel WIP README'yi yanlis yonlendirmeyecek hale getir.
  4) Eski ZIP'i degistirmek yerine `rocket-arena-gemini-complete.zip` isminde guncel kaynaklari ve dokumanlari iceren YENI bir ZIP olustur. `node_modules`, `dist` build cache, `.git`, token, secret ZIP icine konmasin. ZIP CRC/integrity kontrolunu da yap.
  5) Cevabin sonunda: dosya linki, ozet degisiklik listesi, test sonucu, bilinen eksikler, Raspberry Pi'de daha sonra calistirilacak komutlar, gercek tarayici/Pi testlerinin yapilip yapilmadigi acikca bulunsun.

ONEMLI: Bana sadece teorik plan veya baska bir AI icin yeni prompt degil, TAMAMLANMIS GERCEK DOSYALAR ve test edilmis bir proje ZIP'i ver. Proje kapsamindan sapma.
