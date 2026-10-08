# ROCKET ARENA 3D — STATUS & TEST REPORT (2026-10-08)

## 1. Genel Sürüm ve Durum Özeti
Rocket Arena 3D projesi; Three.js, Rapier 3D, Node.js ve WebSocket mimarisi ile güncellenmiş, online 1v1 authoritative ağ modülü ve istemci tahmin/reconciliation motoru ile güçlendirilmiştir.

### Temel Sistem Bileşenleri
- **Authoritative Fizik & Sunucu**: 60 Hz Rapier 3D fizik simülasyonu, 20 Hz snapshot yayını.
- **Güçlendirilmiş Ağ Protokolü**: `sequence` ve `timestamp` tabanlı girdi takibi, sunucu tarafı `lastProcessedSequence` ACK yanıtı.
- **Girdi Doğrulama & Güvenlik**: Bütün girdi eksenleri `[-1.0, 1.0]` aralığına ve `finite number` kontrolüne tabi tutulur. Paket boyutu 2 KB, frekans saniyede max 45 mesaj ile sınırlandırılmıştır.
- **İstemci Tahmin Engine (Prediction & Reconciliation)**: Yerel girdi kuyruğu, sunucu mutabakatı ve max 100 ms sınırlı ekstrapolasyon.
- **Bot Yapay Zekası**: `BotController.js` hareketsiz rakibe karşı gol atma ve kararlı sürüş yeteneklerini korumaktadır.

---

## 2. Test Paketleri ve Kapsamı

Projede çalışan tüm test paketleri:
1. `tests/physics.test.js` — Araç sürüşü, nitro, drift, zıplama, dodge, duvar sürüşü ve top etkileşim testleri.
2. `tests/bot.test.js` — Bot yapay zekası "bot vs idle opponent" ve "bot vs bot" numerik kararlılık testleri.
3. `tests/rules.test.js` — Gol tespiti, geri sayım, altın gol overtime, uzatma ve boost pad yenilenme testleri.
4. `tests/arena.test.js` — Arena çarpışma ağı su sızdırmazlık (3000 ışın testi) ve visual mesh uyum testleri.
5. `tests/loop.test.js` — Sabit adımlı zaman akümülatörü ve eğri hesaplama testleri.
6. `tests/frontend.test.js` — DOM bileşenleri ve ön yüz import kontrat testleri.
7. `tests/online-protocol.test.js` — Ağ protokolü girdi temizleme, oda kodu doğrulanması ve güvenlik testleri.
8. `tests/online-assets.test.js` — Online static varlıklar ve bağımlılık kontrol testleri.
9. `tests/online-integration.test.js` — Gerçek WebSocket sunucusu üzerinde oda oluşturma, 2. oyuncu katılımı ve 3. oyuncu reddi entegrasyon testleri.

---

## 3. Raspberry Pi 4B (ARM64) Performans ve Kurulum Notları
- Sunucu başsız (headless) çalıştığı için grafik kartı gerektirmez.
- Maksimum aktif oda sayısı varsayılan olarak `4` (8 eşzamanlı oyuncu) ile sınırlandırılmıştır.
- Bellek yönetimi: Snapshot oluşturma ve serileştirmesi bellek tahsisi yapar. Pi üzerinde heap/GC ve CPU profiler ile doğrulama henüz yapılmadı.

## İnceleme düzeltmesi (2026-10-08)
- Eski `online-protocol.test.js` yeni `sequence/timestamp` çıktısı nedeniyle başarısızdı; test düzeltildi.
- ACK yalnızca simülasyon tikinde kullanılan input için verilecek şekilde değiştirildi.
- Kopya ve eski `sequence` paketleri reddedilir; maç başlangıcında sayaçlar sıfırlanır.
- İstemci gönderdiği girdileri artık kayıt altına alır ve ACK ile temizler. Bu **tam deterministik client reconciliation değildir**.
- Rakip ve top için 100ms snapshot geçmişi interpolasyonu ve 100ms ile sınırlı hız ekstrapolasyonu kullanılır.
- `SnapshotTimeline` ve `ClientPredictionEngine` için Node built-in testleri eklendi.
- **Doğrulama sınırı:** İnceleme ortamı `registry.npmjs.org` adresine DNS erişemedi; `npm ci`, tüm Rapier/WebSocket testleri ve `npm run build` burada doğrulanamadı.
- Üretim ve Raspberry Pi'de iki gerçek tarayıcıyla oynanabilirlik testi yapılmadı.
