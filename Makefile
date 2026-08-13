.DEFAULT_GOAL := help

.PHONY: help up down dev build fmt lint test ci admin

ADMIN_ENV_FILE ?= .env

help:
	@printf "Available targets:\n"
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
