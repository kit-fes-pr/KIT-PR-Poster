.DEFAULT_GOAL := help

.PHONY: help init init/mac install clean clean/all up updb down dev build fmt lint test ci admin

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

clean:
	@printf '%s\n' 'ローカルの依存関係・ビルド・テスト生成物を削除します。'
	rm -rf node_modules .next .test-dist tsconfig.tsbuildinfo

clean/all:
	@$(MAKE) clean
	@printf '%s\n' 'Docker コンテナと Emulator の永続 volume を削除します。'
	docker compose down -v --remove-orphans

help:
	@printf "Available targets:\n"
	@printf "  init   - Install/check development tools for WSL/Linux\n"
	@printf "  init/mac - Install/check development tools for macOS\n"
	@printf "  install - Install Node.js dependencies\n"
	@printf "  clean  - Remove local dependencies and generated files\n"
	@printf "  clean/all - Also remove Docker volumes and Emulator data\n"
	@printf "  up     - Start the app with Docker Compose\n"
	@printf "  updb   - Start Firebase Emulator services only\n"
	@printf "  down   - Stop the app with Docker Compose\n"
	@printf "  dev    - Start Firebase Emulator (Docker) and Next.js locally\n"
	@printf "  build  - Run Next.js production build\n"
	@printf "  fmt    - Run Prettier write formatting\n"
	@printf "  lint   - Run ESLint\n"
	@printf "  test   - Run build verification\n"
	@printf "  ci     - Run format check, lint, and test\n"
	@printf "  admin  - Create an admin user in Emulator or production Firebase\n"

up:
	@docker compose up --build -d
	@cleanup_done=0; cleanup() { if [ "$$cleanup_done" -eq 1 ]; then return; fi; cleanup_done=1; docker compose exec -T firebase firebase emulators:export --force /opt/firebase/data || true; docker compose down; }; trap cleanup INT TERM EXIT; log_status=0; docker compose logs -f || log_status=$$?; if [ "$$log_status" -eq 130 ] || [ "$$log_status" -eq 143 ]; then exit 0; fi; exit "$$log_status"

updb:
	docker compose up -d --build firebase

down:
	- docker compose exec -T firebase firebase emulators:export --force /opt/firebase/data
	docker compose down

dev: updb
	@command -v node >/dev/null 2>&1 || (printf "Node.js is not installed. Run make init or make init/mac first.\n" >&2; exit 1)
	@command -v npm >/dev/null 2>&1 || (printf "npm is not installed. Run make init or make init/mac first.\n" >&2; exit 1)
	NEXT_PUBLIC_FIREBASE_API_KEY=demo-api-key \
	NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=demo-kit-pr-poster.firebaseapp.com \
	NEXT_PUBLIC_FIREBASE_PROJECT_ID=demo-kit-pr-poster \
	NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=demo-kit-pr-poster.appspot.com \
	NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789 \
	NEXT_PUBLIC_FIREBASE_APP_ID=demo-app-id \
	NEXT_PUBLIC_FIREBASE_USE_EMULATORS=true \
	NEXT_PUBLIC_FIREBASE_EMULATOR_HOST=localhost \
	FIREBASE_USE_EMULATORS=true \
	FIREBASE_ADMIN_PROJECT_ID=demo-kit-pr-poster \
	FIREBASE_AUTH_EMULATOR_HOST=localhost:9099 \
	FIRESTORE_EMULATOR_HOST=localhost:8080 \
	npm run dev

build:
	NEXT_PUBLIC_FIREBASE_API_KEY=demo-api-key \
	NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=demo-kit-pr-poster.firebaseapp.com \
	NEXT_PUBLIC_FIREBASE_PROJECT_ID=demo-kit-pr-poster \
	NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=demo-kit-pr-poster.appspot.com \
	NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789 \
	NEXT_PUBLIC_FIREBASE_APP_ID=demo-app-id \
	NEXT_PUBLIC_FIREBASE_USE_EMULATORS=true \
	NEXT_PUBLIC_FIREBASE_EMULATOR_HOST=localhost \
	FIREBASE_USE_EMULATORS=true \
	FIREBASE_ADMIN_PROJECT_ID=demo-kit-pr-poster \
	FIREBASE_AUTH_EMULATOR_HOST=localhost:9099 \
	FIRESTORE_EMULATOR_HOST=localhost:8080 \
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
