# Rocket Arena 3D — GitHub Pages + Render (Mac / Pi GEREKMEDEN)

## Hazirlik
- Bu ZIP'in **icindeki dosyalari** GitHub deposunun en ust dizinine yukle. ZIP dosyasinin kendisini tek dosya olarak yuklemek GitHub Pages kurulumu degildir.
- Gizli `.github/workflows/pages.yml` klasorunu mutlaka ekle.
- Chrome/Edge/Safari gibi bir tarayici yeterlidir; bilgisayar terminaline gerek yoktur.

## 1 — GitHub uzerinde oyun sayfasi
1. https://github.com/new adresine git; repo adini `rocket-arena-3d` koy, **Public** sec ve Create repository'ye bas.
2. Depo sayfasinda **uploading an existing file** ya da **Add file > Upload files** secenegini ac.
3. ZIP'i once cikar. `index.html`, `online.html`, `src/`, `server/`, `tests/`, `package.json`, `package-lock.json`, `vite.config.js`, `render.yaml`, `.github/` dahil tum icerigi dosya yukleme ekranina surukle. `rocket-arena`/`rocket-arena-github-pages` adinda ekstra ust klasor olmasin.
4. **Commit changes** ile kaydet. `.github` aktarimi browser uzerinden olmadiysa depoda **Add file > Create new file**, isim alanina `.github/workflows/pages.yml` yazip paketteki metni yapistir ve commit et.
5. GitHub repository -> **Settings > Pages > Build and deployment > Source: GitHub Actions**.
6. **Actions** sekmesinde `Deploy Rocket Arena to GitHub Pages` is akisini ac. Yesil basari isareti gorunmeli. Eger basarisizsa Actions logunu kontrol et.
7. Oyun adresin: `https://KULLANICI_ADIN.github.io/rocket-arena-3d/` (kendi kullanici adini yaz; depo adini degistirdiysen onu da degistir).
8. **1V1 · BOTA KARSI** ile tek oyunculu modunu dene. (Gercek tarayici/WebGL testi henuz tarafimizdan yapilmadi.)

## 2 — Render sunucusu olmadan online 1v1 calismaz
1. https://dashboard.render.com adresinde uye ol, GitHub hesabini bagla.
2. **New > Web Service** sec, `rocket-arena-3d` repository'sini sec.
3. Runtime: Node, Plan: **Free**, Build command: `npm ci`, Start command: `npm start`.
4. **Environment** ayarlarina `ALLOWED_ORIGINS` degiskenini ekle. Deger **aynen** `https://KULLANICI_ADIN.github.io` olmali; sonunda `/rocket-arena-3d/` OLMAMALI.
5. Deploy et; Render URL ornegin `https://rocket-arena-server.onrender.com` olsun.
6. URL'nin sonuna `/api/status` ekle: JSON icinde `"ok": true` gormelisin.
7. GitHub Pages oyununda **ONLINE 1V1** sec; **ONLINE SUNUCU ADRESI** alanina Render URL'sini yapistir; ayni oda koduyla iki tarayicidan gir. Adres tarayicida saklanir.
8. Render Free 15 dakika trafiksiz kaldiginda durur; ilk baglanti yaklasik bir dakika gecikebilir.

## Raspberry Pi daha sonra
- Pi sunucusunda: `npm ci && npm run build && npm start` (Node 22.12+ veya Vite uyumlu surum).
- Pi icin Cloudflare Tunnel HTTPS baglantisi olustur; Pages'deki ONLINE SUNUCU ADRESI alanina `https://....trycloudflare.com` adresini gir.
- Pi server'inda `ALLOWED_ORIGINS=https://KULLANICI_ADIN.github.io` ortam degiskeni ayarli olmali.
- Pi'deki mevcut yazilima/madenciye dokunmuyoruz. Dogrudan internete modem portu acma.

## Sorun giderme
- GitHub Pages'te CSS/JS yok veya 404: paket icerigi repo root'unda mi? workflow sonucunu ve Vite base ayarini kontrol et.
- Site aciliyor, online calismiyor: Render servisi "Live" mi? `/api/status` JSON donuyor mu? `ALLOWED_ORIGINS` tam origin mi? HTTPS sayfasindan `ws://` kullanma.
- Iki oyuncu odaya baglanamiyor: ayni room code, ayni Render backend URL'si, odada en fazla 2 kisi.
- GitHub Actions testleri kirmiziysa deployment atlanir; is akisi logunu incele, testler gecmeden deployment basarili sayilmaz.
- GitHub Pages tek basina Node/WebSocket server calistiramaz. Render yerine Pi, VPS veya baska Node host kullanilabilir.

## Gercek test durumu
- Bu ortamda npm bagimliliklari yuklenmediyse production bundle/gercek browser oynanisi dogrulanmamistir. GitHub Actions npm ci, npm test, npm run build, npm run test:smoke calistiracak.
- Oyun henuz tam ticari kalite guvencesi almis degil; WebGL ve 1v1'i ayri tarayicilarda test et.
