# Rocket Arena 3D — Gemini ZIP teknik incelemesi (2026-10-08)

## Başlangıç
- Kaynak: `rocket-arena-gemini-complete.zip` (kullanıcının sağladığı orijinal paket).
- ZIP bütünlük kontrolü başarılıydı.
- Bağımlılıksız başlangıç testleri: 13 testten 12 geçti, 1 başarısız (`online-protocol.test.js`).
- `npm ci` DNS erişiminde takıldı (`registry.npmjs.org` çözümlenemiyor). Bu ortamda bağımlılık indirmek mümkün değil.

## Yapılan düzenlemeler
1. `server/protocol.js`: Sonlu sayı ve güvenli tamsayı sequence/timestamp doğrulaması; hatalı sequence kabul edilmiyor.
2. `server/rooms.js`: Input ACK yalnızca simülasyon adımında kullanılan dizi numarası için gönderiliyor. Yinelenen/eski paketler reddediliyor. Rematch sayacı temizleniyor.
3. `server/server.js`: Katılmadan boşta kalan WebSocket bağlantılarını 10 saniyede kapama ve bağlantı sayısı sınırı.
4. `src/online/ClientPredictionEngine.js`: Gönderilmiş input geçmişi, ACK ile temizleme ve en fazla 100ms hafif görsel konum tahmini. Bu deterministik Rapier re-simulation DEĞİLDİR. Zıplama/duvar/temas fizikleri tekrar işlenmiyor.
5. `src/online/SnapshotTimeline.js`: Geçmiş snapshot interpolasyonu; maksimum 100ms velocity-extrapolation, sonra görüntü sabitleme.
6. `src/online/RemoteGameView.js`: Rakip ve top timeline üzerinden görüntüleniyor; yerel araç sınırlı tahmin kullanıyor. Gol ve kickoff teleportunda tampon sıfırlanıyor.
7. `src/online-main.js`: Gönderilen input kaydı ve yeni maç başlangıcında sequence sıfırlaması.
8. `tests/online-protocol.test.js`: Yeni protokole göre beklentiler ve geçersiz sequence testleri.
9. `tests/online-prediction.test.js`: ACK, kuyruk ve timeline sınır testleri.
10. Raspberry Pi belgeleri: Doğru ZIP adı ve Node sürümü, Vite dev/WS ayrımı, doğrulama sınırları.

## Bu ortamda çalıştırılabilen doğrulama

```bash
node --test tests/frontend.test.js tests/online-assets.test.js tests/online-protocol.test.js tests/online-prediction.test.js
# 18 test, 18 passed, 0 failed
find src server tests -name '*.js' -print0 | xargs -0 -n1 node --check
# Tüm JS dosyaları için sözdizimi kontrolü başarılı
```

## Henüz doğrulanamayanlar / bilinen eksikler
- `npm ci`, tam `npm test`, `npm run build`, gerçek HTTP/WebSocket + Rapier ve WebGL tarayıcı testleri çalıştırılamadı. İnternet/DNS engeli.
- Gerçek iki cihaz ile online maç, gecikme/jitter, çok oda ve Raspberry Pi ARM64 üzerinde performans denenmedi.
- Tam deterministik client prediction/reconciliation (Rapier state restore ve replay) YOK. Yukarıdaki hafif tahmin özellikle duvar, jump ve çarpışmalarda isabetsiz olabilir.
- WebSocket test paketi sabit port ve sınırlı assertions kullanıyor; genişletilmesi öneriliyor.
- Pi üzerinde var olan Monero miner, işletim sistemi, servisler veya dosyalar üzerinde hiçbir işlem yapılmadı.

## Raspberry Pi'ye yüklemeden önce
Node.js 22.12+ kur. Pi 4B ARM64 üzerinde `npm ci && npm test && npm run build && npm start` çalıştır ve iki tarayıcıyla aynı kod üzerinden maçı doğrula. Açık internete geçmeden önce önce LAN'da test yap.

## Ek test (bağımlılıklar yüklenince)
`npm run test:smoke`: Production sunucusunu ayrı Node sürecinde başlatır, HTTP sayfa sunumunu ve gerçek /ws üstünden 2 oyuncuyu ve input ACK'ini dener. Adı browser-smoke olsa da **WebGL tarayıcı render testi değildir**. İnceleme ortamında `ws` / Rapier bağımlılıkları bulunmadığından bu test çalıştırılamadı.
