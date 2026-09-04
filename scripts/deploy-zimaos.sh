#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd)"
DEPLOY_BRANCH="${DEPLOY_BRANCH:-master}"
DATA_ROOT="${KITCHEN_APP_ROOT:-/DATA/AppData/kitchen-dashboard}"
KITCHEN_HTTP_PORT="${KITCHEN_HTTP_PORT:-3000}"

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

mkdir -p "$DATA_ROOT/data"

export KITCHEN_DATA_DIR="$DATA_ROOT/data"
export KITCHEN_HTTP_PORT

docker compose -f deploy/zimaos/compose.yml build --pull
docker compose -f deploy/zimaos/compose.yml up -d --remove-orphans
docker compose -f deploy/zimaos/compose.yml ps

printf '\nDashboard origin: http://192.168.1.6:%s\n' "$KITCHEN_HTTP_PORT"
printf 'Point the Cloudflare tunnel at this HTTP origin.\n'
