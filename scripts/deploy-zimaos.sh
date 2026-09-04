#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd)"
DEPLOY_BRANCH="${DEPLOY_BRANCH:-master}"
DATA_ROOT="${KITCHEN_APP_ROOT:-/DATA/AppData/kitchen-dashboard}"
KITCHEN_HTTPS_PORT="${KITCHEN_HTTPS_PORT:-9443}"

# ZimaOS mounts root's home read-only. When the script is launched through
# sudo, give Docker a writable config directory instead of /root/.docker.
DOCKER_CONFIG_DIR="${DOCKER_CONFIG:-$HOME/.docker}"
if ! mkdir -p "$DOCKER_CONFIG_DIR" 2>/dev/null; then
  DOCKER_CONFIG_DIR="/tmp/kitchen-dashboard-docker-config-$(id -u)"
  mkdir -p "$DOCKER_CONFIG_DIR"
  export DOCKER_CONFIG="$DOCKER_CONFIG_DIR"
fi

cd "$REPO_DIR"

if [[ "${SKIP_GIT_PULL:-0}" != "1" ]]; then
  git fetch origin "$DEPLOY_BRANCH"
  git merge --ff-only "origin/$DEPLOY_BRANCH"
fi

mkdir -p "$DATA_ROOT/data" "$DATA_ROOT/caddy" "$DATA_ROOT/caddy-config"

export KITCHEN_DATA_DIR="$DATA_ROOT/data"
export KITCHEN_CADDY_DIR="$DATA_ROOT/caddy"
export KITCHEN_CADDY_CONFIG_DIR="$DATA_ROOT/caddy-config"
export KITCHEN_HTTPS_PORT

docker compose -f deploy/zimaos/compose.yml build --pull
docker compose -f deploy/zimaos/compose.yml up -d --remove-orphans
docker compose -f deploy/zimaos/compose.yml ps

printf '\nDashboard: https://192.168.1.6:%s\n' "$KITCHEN_HTTPS_PORT"
printf 'iPad trust certificate: %s/caddy/pki/authorities/local/root.crt\n' "$DATA_ROOT"
