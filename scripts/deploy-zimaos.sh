#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd)"
DEPLOY_BRANCH="${DEPLOY_BRANCH:-master}"
DATA_ROOT="${KITCHEN_APP_ROOT:-/DATA/AppData/kitchen-dashboard}"

cd "$REPO_DIR"

if [[ "${SKIP_GIT_PULL:-0}" != "1" ]]; then
  git fetch origin "$DEPLOY_BRANCH"
  git merge --ff-only "origin/$DEPLOY_BRANCH"
fi

mkdir -p "$DATA_ROOT/data" "$DATA_ROOT/caddy" "$DATA_ROOT/caddy-config"

export KITCHEN_DATA_DIR="$DATA_ROOT/data"
export KITCHEN_CADDY_DIR="$DATA_ROOT/caddy"
export KITCHEN_CADDY_CONFIG_DIR="$DATA_ROOT/caddy-config"

docker compose -f deploy/zimaos/compose.yml build --pull
docker compose -f deploy/zimaos/compose.yml up -d --remove-orphans
docker compose -f deploy/zimaos/compose.yml ps

printf '\nDashboard: https://192.168.1.6:8443\n'
printf 'iPad trust certificate: %s/caddy/pki/authorities/local/root.crt\n' "$DATA_ROOT"
