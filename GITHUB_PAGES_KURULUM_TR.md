# Rocket Arena 3D — GitHub Pages (Mac / Pi / sunucu GEREKMEDEN)

## Hazirlik
- Bu ZIP'in **icindeki dosyalari** GitHub deposunun en ust dizinine yukle. ZIP dosyasinin kendisini tek dosya olarak yuklemek GitHub Pages kurulumu degildir.
- Gizli `.github/workflows/pages.yml` klasorunu mutlaka ekle.
- Chrome/Edge/Safari gibi bir tarayici yeterlidir; bilgisayar terminaline gerek yoktur.

## 1 — GitHub uzerinde oyun sayfasi
1. https://github.com/new adresine git; repo adini `rocket-arena-3d` koy, **Public** sec ve Create repository'ye bas.
2. Depo sayfasinda **uploading an existing file** ya da **Add file > Upload files** secenegini ac.
3. ZIP'i once cikar. `index.html`, `online.html`, `src/`, `tests/`, `package.json`, `package-lock.json`, `vite.config.js`, `.github/` dahil tum icerigi dosya yukleme ekranina surukle. `rocket-arena`/`rocket-arena-github-pages` adinda ekstra ust klasor olmasin.
4. **Commit changes** ile kaydet. `.github` aktarimi browser uzerinden olmadiysa depoda **Add file > Create new file**, isim alanina `.github/workflows/pages.yml` yazip paketteki metni yapistir ve commit et.
5. GitHub repository -> **Settings > Pages > Build and deployment > Source: GitHub Actions**.
6. **Actions** sekmesinde `Deploy Rocket Arena to GitHub Pages` is akisini ac. Yesil basari isareti gorunmeli. Eger basarisizsa Actions logunu kontrol et.
7. Oyun adresin: `https://KULLANICI_ADIN.github.io/rocket-arena-3d/` (kendi kullanici adini yaz; depo adini degistirdiysen onu da degistir).
8. **1V1 · BOTA KARSI** ile tek oyunculu modunu dene. (Gercek tarayici/WebGL testi henuz tarafimizdan yapilmadi.)

## 2 — Online: tabletten oda kur (sunucu yok)
1. Oyunda **ONLINE · ARKADAŞLARLA**'ya gir.
2. Biri **ODA BOYUTU** seçer (1V1 / 2V2 / 3V3) ve **ODA KUR**'a basar. Ekranda 4 karakterlik oda kodu çıkar.
3. Diğerleri aynı sayfada **ODA KODU** alanına bu kodu yazıp **ODAYA KATIL**'a basar. Ya da kurucu **DAVET LİNKİNİ PAYLAŞ** ile linki gönderir; link kodu otomatik doldurur.
4. Oda dolunca maç kendiliğinden başlar. Kurucu **MAÇI BAŞLAT** ile daha erken de başlatabilir; boş yerlere bot geçer.
5. Maç, odayı kuran tablette çalışır: o tabletin Safari'si açık ve ekranı açık kalmalı.
6. İnternet sadece tabletlerin birbirini bulması için gerekir (PeerJS ücretsiz servisi). Aynı Wi-Fi'da gecikme en düşüktür.

## Sorun giderme
- GitHub Pages'te CSS/JS yok veya 404: paket icerigi repo root'unda mi? workflow sonucunu ve Vite base ayarini kontrol et.
- GitHub Actions testleri kirmiziysa deployment atlanir; is akisi logunu incele, testler gecmeden deployment basarili sayilmaz.
- "Bu kodla açık bir oda bulunamadı": kod yanlış ya da kurucunun oyun ekranı kapandı.
- "Oyun sürümleri farklı": bir tablette eski sürüm önbellekte. İki tablette de sayfayı yenile (gerekirse adresin sonuna `?v=3`).
- "Eşleştirme servisine ulaşılamadı": internet bağlantısını kontrol et.
- "Tabletler arasında doğrudan bağlantı kurulamadı": iki cihazı aynı Wi-Fi ağına bağla (bazı okul/kurum ağları doğrudan bağlantıyı engeller).

## Gercek test durumu
- GitHub Actions `npm ci`, `npm test`, `npm run build`, `npm run test:smoke` calistirir.
- Oyun henuz tam ticari kalite guvencesi almis degil; WebGL ve online odayi iki gercek tablette test et.
