# `make` is the source of truth for running this project. Prefer these targets
# over raw docker compose or pnpm invocations.
#
# Prerequisites: Docker Desktop and Node 24. Nothing else - pnpm arrives via
# Corepack, everything else runs in a container.

SHELL := /bin/bash
COMPOSE := docker compose --env-file .env -f infra/docker-compose.yml

.DEFAULT_GOAL := help
.PHONY: help setup up down clean logs ps test test-unit test-integration \
        seed sign verify tamper typecheck

help: ## Show available targets
	@grep -hE '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'

.env: ## Created from .env.example on first run
	@cp .env.example .env && echo "Created .env from .env.example"

setup: .env ## First run only: create .env
	@corepack enable >/dev/null 2>&1 || true
	@pnpm install

up: .env ## Start postgres + minio, apply schema, seed the sample document
	@$(COMPOSE) up -d --wait
	@$(MAKE) --no-print-directory seed
	@echo ""
	@echo "  MinIO console  http://localhost:$${MINIO_CONSOLE_PORT:-9001}"
	@echo "  Next: make verify   (or make tamper, then make verify again)"

down: ## Stop services, keep data
	@$(COMPOSE) down

clean: ## Stop services and wipe volumes + signing key (fresh identity)
	@$(COMPOSE) down -v
	@rm -rf keys
	@echo "Volumes and signing key removed. Previously stored signatures are gone."

logs: ## Tail service logs
	@$(COMPOSE) logs -f

ps: ## Show service status
	@$(COMPOSE) ps

seed: .env ## Load the sample agreement into object storage
	@node --env-file=.env packages/adapters/scripts/seed.ts

sign: .env ## Sign the sample document from the CLI (SIGNER=name to override)
	@node --env-file=.env packages/adapters/scripts/sign.ts "$${SIGNER:-rob@sploosh.ai}"

verify: .env ## Re-verify every stored signature from the command line
	@node --env-file=.env packages/adapters/scripts/verify.ts

tamper: .env ## Rewrite one byte of the stored document, to demo detection
	@node --env-file=.env packages/adapters/scripts/tamper.ts

test-unit: ## vitest, pure core only - no containers needed, fast
	@pnpm --filter @sig/core test

test-integration: .env ## vitest against real postgres + minio (needs `make up`)
	@set -a && source .env && set +a && pnpm --filter @sig/adapters test

test: test-unit test-integration ## All vitest suites

typecheck: ## tsc --noEmit across the workspace
	@pnpm -r typecheck
