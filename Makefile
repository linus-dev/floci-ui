.PHONY: up up-multicloud down logs build push dev dev-build dev-down dev-logs dev-api dev-frontend install

up:
	docker compose up -d

up-multicloud:
	docker compose --profile multicloud up -d

down:
	docker compose --profile multicloud down

logs:
	docker compose logs -f

build:
	docker build -f docker/Dockerfile -t floci/floci-ui:latest .

push: build
	docker push floci/floci-ui:latest

install:
	cd packages/frontend && npm install
	cd packages/api && ~/.bun/bin/bun install

dev-build:
	docker compose build

dev:
	docker compose up

dev-down:
	docker compose down

dev-logs:
	docker compose logs -f

dev-api:
	cd packages/api && ~/.bun/bin/bun run --watch src/index.ts

dev-frontend:
	cd packages/frontend && npm run dev
