#!/usr/bin/env bash
set -euo pipefail

if [[ "${OSTYPE:-}" != linux* ]] && ! grep -qi microsoft /proc/version 2>/dev/null; then
  printf '%s\n' 'このコマンドは WSL/Linux 用です。macOS では make init/mac を実行してください。' >&2
  exit 1
fi

if ! command -v sudo >/dev/null 2>&1; then
  printf '%s\n' 'sudo が必要です。WSL に sudo をインストールしてから再実行してください。' >&2
  exit 1
fi

sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1 || ! command -v npx >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

if ! command -v docker >/dev/null 2>&1; then
  sudo apt-get install -y docker.io docker-compose-plugin
fi

printf '\n%s\n' 'WSL/Linux の開発ツールを確認しました。'
node --version
npm --version
npx --version
docker --version
docker compose version 2>/dev/null || true
