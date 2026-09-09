#!/usr/bin/env bash
# Per-boot startup for the Delphic Meals Cloud Agent environment.
# Starts the PostgreSQL daemon and waits until it accepts connections.
set -euo pipefail

PG_VERSION="16"

echo "==> Starting PostgreSQL cluster"
sudo pg_ctlcluster "${PG_VERSION}" main start >/dev/null 2>&1 || true

for _ in $(seq 1 30); do
  if sudo -u postgres pg_isready -q; then
    echo "==> PostgreSQL is ready"
    exit 0
  fi
  sleep 1
done

echo "!! PostgreSQL did not become ready in time" >&2
exit 1
