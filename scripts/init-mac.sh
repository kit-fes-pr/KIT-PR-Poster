#!/usr/bin/env bash
set -euo pipefail

if [[ "${OSTYPE:-}" != darwin* ]]; then
  printf '%s\n' 'このコマンドは macOS 用です。WSL/Linux では make init を実行してください。' >&2
  exit 1
fi

if ! command -v brew >/dev/null 2>&1; then
  printf '%s\n' 'Homebrew をインストールします。'
  homebrew_install_script=$(mktemp)
  trap 'rm -f "$homebrew_install_script"' EXIT
  curl --fail --location --silent --show-error \
    --output "$homebrew_install_script" \
    https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh
  /bin/bash "$homebrew_install_script"
  if [[ -x /opt/homebrew/bin/brew ]]; then
    eval "$(/opt/homebrew/bin/brew shellenv)"
  elif [[ -x /usr/local/bin/brew ]]; then
    eval "$(/usr/local/bin/brew shellenv)"
  fi
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
