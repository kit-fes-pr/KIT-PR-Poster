#!/usr/bin/env bash
set -euo pipefail

if [[ "${OSTYPE:-}" != darwin* ]]; then
  printf '%s\n' 'このコマンドは macOS 用です。WSL/Linux では make init を実行してください。' >&2
  exit 1
fi

if ! command -v brew >/dev/null 2>&1; then
  printf '%s\n' 'Homebrew をインストールします。'
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
fi

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1 || ! command -v npx >/dev/null 2>&1; then
  brew install node@24
  brew link --overwrite --force node@24
fi

if ! command -v docker >/dev/null 2>&1; then
  brew install --cask docker
  printf '\n%s\n' 'Docker Desktop を起動してから make install / make up を実行してください。'
fi

printf '\n%s\n' 'macOS の開発ツールを確認しました。'
node --version
npm --version
npx --version
docker --version
docker compose version 2>/dev/null || true
