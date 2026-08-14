.PHONY: dev migrate test-all stop clean

dev:
	docker compose up -d --build
	@echo "Services started. Run make stop to tear down."

stop:
	docker compose down

migrate:
	@if [ -f server/scripts/run-migrations.sh ]; then \
		bash server/scripts/run-migrations.sh; \
	else \
		echo "Migration script not found"; \
	fi

test-all:
	cd server && go test -v ./api/... ./shared/... ./worker/... ./scripts/...
	@if [ -d server/captions-sidecar ]; then \
		echo "Running python tests..."; \
	fi
