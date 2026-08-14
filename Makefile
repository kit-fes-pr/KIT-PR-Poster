.DEFAULT_GOAL := help

.PHONY: help init init/mac install up down dev build fmt lint test ci admin

ADMIN_ENV_FILE ?= .env

init:
	@bash scripts/init-wsl.sh

init/mac:
	@bash scripts/init-mac.sh

install:
	@command -v node >/dev/null 2>&1 || (printf "Node.js is not installed. Run make init or make init/mac first.\n" >&2; exit 1)
	@command -v npm >/dev/null 2>&1 || (printf "npm is not installed. Run make init or make init/mac first.\n" >&2; exit 1)
	@command -v npx >/dev/null 2>&1 || (printf "npx is not installed. Run make init or make init/mac first.\n" >&2; exit 1)
	npm install

help:
	@printf "Available targets:\n"
	@printf "  init   - Install/check development tools for WSL/Linux\n"
	@printf "  init/mac - Install/check development tools for macOS\n"
	@printf "  install - Install Node.js dependencies\n"
	@printf "  up     - Start the app with Docker Compose\n"
	@printf "  down   - Stop the app with Docker Compose\n"
	@printf "  dev    - Start the app with npm\n"
	@printf "  build  - Run Next.js production build\n"
	@printf "  fmt    - Run Prettier write formatting\n"
	@printf "  lint   - Run ESLint\n"
	@printf "  test   - Run build verification\n"
	@printf "  ci     - Run format check, lint, and test\n"
	@printf "  admin  - Create an admin user in Emulator or production Firebase\n"

up:
	docker compose up --build

down:
	docker compose down

dev:
	npm run dev

build:
	npm run build

fmt:
	npm run format

lint:
	npm run lint

test:
	npm run test

ci:
	npm run ci

admin:
	@if [ ! -t 0 ]; then printf "make admin requires an interactive terminal\n" >&2; exit 1; fi
	@if [ -f "$(ADMIN_ENV_FILE)" ]; then \
		printf '環境ファイル %s を読み込みます。Firebase 本番環境へ接続する可能性があります。続行しますか？ [y/N] ' "$(ADMIN_ENV_FILE)"; \
		read -r ADMIN_ENV_CONFIRMATION; \
		case "$$ADMIN_ENV_CONFIRMATION" in \
			y|Y) ;; \
			*) printf '中止しました。\n' >&2; exit 1 ;; \
		esac; \
	fi
	@printf "Admin email: "; read -r ADMIN_EMAIL; \
	printf "Admin password: "; \
	trap 'stty echo; printf "\n" >&2' INT TERM EXIT; \
	stty -echo; read -r ADMIN_PASSWORD; stty echo; \
	trap - INT TERM EXIT; printf "\n"; \
	printf "Admin name: "; read -r ADMIN_NAME; \
	export ADMIN_EMAIL="$$ADMIN_EMAIL" ADMIN_PASSWORD="$$ADMIN_PASSWORD" ADMIN_NAME="$$ADMIN_NAME"; \
	if [ -f "$(ADMIN_ENV_FILE)" ]; then \
		node --env-file="$(ADMIN_ENV_FILE)" scripts/create-admin.mjs; \
	else \
		node scripts/create-admin.mjs; \
	fi
