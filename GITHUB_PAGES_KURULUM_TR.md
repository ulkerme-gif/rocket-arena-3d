# Rocket Arena 3D — GitHub Pages (Mac / Pi / sunucu GEREKMEDEN)

## 1 — Yeni repo (iPad + Codespaces)
1. https://github.com/new adresine git. Repo adini yaz (ornek `rocket-arena-3d`), **Public** sec, **Add a README file** kutusunu isaretle (Codespaces bos repoda acilmaz), **Create repository**.
2. Repo **Settings > Pages > Build and deployment > Source: GitHub Actions** sec.
3. Repo ana sayfasinda **Code > Codespaces > Create codespace on main**.
4. Tam proje ZIP'ini Codespaces'teki dosya listesinin en ustune (repo koku) surukle.
5. Terminalde:
   ```bash
   cd "$(git rev-parse --show-toplevel)"
   unzip -o -q rocket-arena-3d-tam-proje.zip
   rm rocket-arena-3d-tam-proje.zip
   git add -A
   git commit -m "Rocket Arena 3D"
   git push
   ```
6. **Actions** sekmesinde `Deploy Rocket Arena to GitHub Pages` yesil olunca oyun adresin: `https://KULLANICI_ADIN.github.io/REPO_ADIN/`. Vite yolu repo adindan otomatik alir; repo adini istedigin gibi koyabilirsin.
7. Sonraki guncellemeler: yama ZIP'ini ayni sekilde repo kokune yukle, `unzip -o`, `git add -A`, `git commit`, `git push`.

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
- "Oyun sürümleri farklı": bir tablette eski sürüm önbellekte. İki tablette de sayfayı yenile (gerekirse adresin sonuna `?v=` ve yeni bir sayi ekle).
- "Eşleştirme servisine ulaşılamadı": internet bağlantısını kontrol et.
- "Tabletler arasında doğrudan bağlantı kurulamadı": iki cihazı aynı Wi-Fi ağına bağla (bazı okul/kurum ağları doğrudan bağlantıyı engeller).

## Gercek test durumu
- GitHub Actions `npm ci`, `npm test`, `npm run build`, `npm run test:smoke` calistirir.
- Oyun henuz tam ticari kalite guvencesi almis degil; WebGL ve online odayi iki gercek tablette test et.
