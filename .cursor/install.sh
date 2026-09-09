#!/usr/bin/env bash
# Idempotent repository setup for the Delphic Meals Cloud Agent environment.
# Installs system + npm dependencies, provisions a local PostgreSQL database,
# writes a local server/.env if missing, and runs database migrations.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PG_VERSION="16"
DB_NAME="delphic_meals"
DB_USER="delphic"
DB_PASS="delphic"

echo "==> Installing PostgreSQL ${PG_VERSION} (if needed)"
if ! command -v pg_ctlcluster >/dev/null 2>&1; then
  sudo apt-get update -qq
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq postgresql postgresql-contrib
fi

echo "==> Ensuring PostgreSQL cluster is running"
sudo pg_ctlcluster "${PG_VERSION}" main start >/dev/null 2>&1 || true

# Wait for the server to accept connections.
for _ in $(seq 1 30); do
  if sudo -u postgres pg_isready -q; then break; fi
  sleep 1
done

echo "==> Ensuring database role and database exist"
if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}'" | grep -q 1; then
  sudo -u postgres psql -c "CREATE ROLE ${DB_USER} LOGIN PASSWORD '${DB_PASS}';"
fi
if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" | grep -q 1; then
  sudo -u postgres createdb -O "${DB_USER}" "${DB_NAME}"
fi
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE ${DB_NAME} TO ${DB_USER};" >/dev/null

echo "==> Writing server/.env for local development (if missing)"
ENV_FILE="${REPO_ROOT}/server/.env"
if [ ! -f "${ENV_FILE}" ]; then
  cat > "${ENV_FILE}" <<EOF
DATABASE_URL=postgres://${DB_USER}:${DB_PASS}@localhost:5432/${DB_NAME}
PORT=3000
NODE_ENV=development
BACKEND_URL=http://localhost:3000
FRONTEND_URL=http://localhost:3000
ACCESS_CODE=delphic-local-dev
GOOGLE_CLIENT_ID=
GOOGLE_SERVICE_ACCOUNT_KEY=
GOOGLE_SPREADSHEET_ID=
SMTP_HOST=
SMTP_PORT=465
SMTP_USER=
SMTP_PASS=
EMAIL_FROM=Delphic Club <noreply@delphicclub.com>
GROUPME_BOT_ID=
GROUPME_ACCESS_TOKEN=
GROUPME_GROUP_ID=
GROUPME_CALLBACK_SECRET=
GROUPME_NICKNAME_MAP=
GROUPME_TOPIC_ID=
EOF
fi

echo "==> Installing npm dependencies"
cd "${REPO_ROOT}/server"
npm install

echo "==> Running database migrations"
npm run migrate

echo "==> Install complete"
