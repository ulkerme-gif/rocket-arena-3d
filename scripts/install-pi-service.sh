#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ ! -f dist/online.html ]]; then
  echo 'Önce npm ci && npm run build komutlarını çalıştır.' >&2
  exit 1
fi
NODE_BIN="$(command -v node || true)"
if [[ -z "$NODE_BIN" ]]; then
  echo 'Node.js yüklü değil.' >&2
  exit 1
fi
PROJECT_PATH="$(pwd)"
mkdir -p "$HOME/.config/systemd/user"
cat > "$HOME/.config/systemd/user/rocket-arena.service" <<SERVICE
[Unit]
Description=Rocket Arena 3D online WebSocket server
After=network.target

[Service]
Type=simple
WorkingDirectory=${PROJECT_PATH}
ExecStart=${NODE_BIN} ${PROJECT_PATH}/server/server.js
Environment=PORT=3000
Environment=MAX_ROOMS=4
Environment=TICK_RATE=60
Restart=on-failure
RestartSec=4

[Install]
WantedBy=default.target
SERVICE
systemctl --user daemon-reload
systemctl --user enable --now rocket-arena.service
printf '\nDurum: systemctl --user status rocket-arena\nLog: journalctl --user -u rocket-arena -f\n'
printf 'Pi yeniden başlasa da servis çalışsın istersen: sudo loginctl enable-linger "%s"\n' "$USER"
