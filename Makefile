.DEFAULT_GOAL := help

.PHONY: help init up down dev build fmt lint test ci admin

ADMIN_EMAIL ?=
ADMIN_PASSWORD ?=
ADMIN_ENV_FILE ?= .env

help:
	@printf "Available targets:\n"
	@printf "  init   - Install dependencies and create local emulator config\n"
	@printf "  up     - Start the app with Docker Compose\n"
	@printf "  down   - Stop the app with Docker Compose\n"
	@printf "  dev    - Start the app with npm\n"
	@printf "  build  - Run Next.js production build\n"
	@printf "  fmt    - Run Prettier write formatting\n"
	@printf "  lint   - Run ESLint\n"
	@printf "  test   - Run build verification\n"
	@printf "  ci     - Run format check, lint, and test\n"
	@printf "  admin  - Create an admin user via Firebase Admin SDK\n"

init:
	@command -v node >/dev/null 2>&1 || { printf "Node.js 24 or newer is required\n" >&2; exit 1; }
	@command -v java >/dev/null 2>&1 || { printf "Java 21 or newer is required\n" >&2; exit 1; }
	npm ci
	@test -f .env || cp .env.example .env
	@printf "Ready. Run: make dev\n"

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
	@if [ -z "$(ADMIN_EMAIL)" ]; then printf "ADMIN_EMAIL is required\n" >&2; exit 1; fi
	@if [ -z "$(ADMIN_PASSWORD)" ] && [ ! -t 0 ]; then printf "ADMIN_PASSWORD is required in non-interactive environments\n" >&2; exit 1; fi
	@if [ -z "$(ADMIN_PASSWORD)" ]; then \
		printf "Admin password: " >&2; \
		trap 'stty echo; printf "\n" >&2' INT TERM EXIT; \
		stty -echo; \
		read -r ADMIN_PASSWORD; \
		stty echo; \
		trap - INT TERM EXIT; \
		printf "\n" >&2; \
	fi; \
	ADMIN_EMAIL="$(ADMIN_EMAIL)" ADMIN_PASSWORD="$$ADMIN_PASSWORD" node --env-file="$(ADMIN_ENV_FILE)" scripts/create-admin.mjs
