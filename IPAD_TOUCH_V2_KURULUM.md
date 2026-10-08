# Rocket Arena 3D - iPad Touch v2

Bu guncelleme, mevcut GitHub Codespaces repository'si UZERINE uygulanir.
Eskileri silmeyin, repository'yi tekrar olusturmayin.

## iPad / Safari / GitHub Codespaces

1. `rocket-arena-ipad-touch-v2-patch.zip` dosyasini iPad'in Dosyalar uygulamasina indirin.
2. Codespaces'i acin, soldaki Explorer'da repository'nin en ust klasorunu secin.
3. Explorer'daki `...` > `Upload Files` ile patch ZIP'i repository'nin kokune yukleyin.
4. Terminal > New Terminal ile terminal acin.
5. Su komutlari calistirin:

```bash
cd "$(git rev-parse --show-toplevel)"
unzip -o -q rocket-arena-ipad-touch-v2-patch.zip
rm rocket-arena-ipad-touch-v2-patch.zip
git add -A
git commit -m "Add iPad touch control toggle"
git push
```

6. GitHub > Actions: `Deploy Rocket Arena to GitHub Pages` isleminin yesil olmasini bekleyin.
7. iPad Safari'de oyunu yenileyin. Gerekirse URL sonuna `?v=2` yazin.
8. Oyun macini baslatin; ust sagdaki `🎮 TUSLARI GIZLE / GOSTER` dugmesi dokunmatik tuslari acar ve kapatir.

## Surus

- SOL: sol/sag donus, GAZ, GERI
- SAG: KAMERA, DRIFT, ZIPLA, BOOST
- Iki veya daha fazla dugmeye ayni anda basabilirsiniz (ornegin GAZ + SOL + BOOST).
- Klavye bagliysa kontroller gizliyken WASD/Space/Shift normal calismaya devam eder.
- Tercihiniz tarayicida saklanir ve hem offline bot macinda hem online 1v1'de aynidir.
- iPad'i yatay kullanmak daha genis kontroller ve saha gorunumu saglar.

## Teknik degisiklikler

- `src/input/TouchControls.js`: durum/tercih yonetimi, goster/gizle, pointer capture, stuck-input korumasi.
- `src/styles/main.css`: buyuk touch tuslari, safe-area, dikey/yatay responsive tasarim, mod butonu.
- `index.html`, `online.html`: erisilebilir yeni toggle dugmesi ve viewport-fit.
- `tests/touch-controls.test.js`, `tests/ipad-input-integration.test.js`: coklu dokunus, saklanan tercih, klavye kullanimini dogrulayan testler.

## Sinirlar

Burada fiziksel iPad/Safari testini gerceklestiremedik. GitHub Actions'in tum bagimliliklari kurup `npm test` ve `npm run build` calistirmasi gerekir.
Multiplayer icin hala ayri WebSocket sunucusu (Render veya Raspberry Pi) gereklidir.
