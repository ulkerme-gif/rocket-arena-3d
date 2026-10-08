ROCKET ARENA ONLINE - Raspberry Pi 4B / 8GB

1) ZIP'i bilgisayar/telefonundan Pi'ye SSH/SFTP ile gonder. Pi OS Lite tarayici icermez.
2) Pi terminalinde:
   cd ZIP_dosyasinin_bulundugu_klasor
   unzip rocket-arena-gemini-reviewed.zip -d ~/rocket-arena-deploy
   cd ~/rocket-arena-deploy/rocket-arena
   node -v  # 22.12 veya daha yeni olsun
   npm ci
   npm test
   npm run build
   npm start
3) Baska cihazdan http://raspberrypi.local:3000/online.html ac.
4) Arkadasin da ayni adrese girsin. Ayni oda koduyla eslesin.

Ev disindan erisim: once local testi yap; sonra Pi'de cloudflared Tunnel.
Ayrintili Turkce kilavuz: rocket-arena/docs/RASPBERRY_PI_ONLINE.md

NOT: Bu bir ilk multiplayer prototipi. Pi'de/WebGL'de canli denenmedi.
