#!/usr/bin/env bash
set -euo pipefail

: "${CPANEL_SSH_HOST:?Set the cPanel SSH host secret}"
: "${CPANEL_SSH_USER:?Set the cPanel SSH user secret}"
: "${CPANEL_SSH_KEY:?Set the cPanel SSH private key secret}"
: "${CPANEL_KNOWN_HOSTS_FILE:?Set the verified known_hosts file path}"
: "${CPANEL_APP_PATH:?Set the absolute application path secret}"
: "${CPANEL_NODE_ENV_PATH:?Set the Node.js virtualenv activation path secret}"
: "${CPANEL_HEALTH_URL:?Set the public application health URL secret}"
CPANEL_SSH_PORT="${CPANEL_SSH_PORT:-22}"

temp_dir="$(mktemp -d)"
trap 'rm -rf "$temp_dir"' EXIT
printf '%s\n' "$CPANEL_SSH_KEY" > "$temp_dir/deploy_key"
cp "$CPANEL_KNOWN_HOSTS_FILE" "$temp_dir/known_hosts"
chmod 600 "$temp_dir/deploy_key" "$temp_dir/known_hosts"

ssh_options=(-p "$CPANEL_SSH_PORT" -i "$temp_dir/deploy_key" -o BatchMode=yes -o StrictHostKeyChecking=yes -o "UserKnownHostsFile=$temp_dir/known_hosts")
scp_options=(-P "$CPANEL_SSH_PORT" -i "$temp_dir/deploy_key" -o BatchMode=yes -o StrictHostKeyChecking=yes -o "UserKnownHostsFile=$temp_dir/known_hosts")
remote="$CPANEL_SSH_USER@$CPANEL_SSH_HOST"
archive="$temp_dir/deploy.tar.gz"

tar -czf "$archive" package.json package-lock.json server.cjs public sql src
remote_archive="$(ssh "${ssh_options[@]}" "$remote" 'mktemp /tmp/license-server-deploy.XXXXXX')"
scp "${scp_options[@]}" "$archive" "$remote:$remote_archive"

ssh "${ssh_options[@]}" "$remote" bash -s -- "$remote_archive" "$CPANEL_APP_PATH" "$CPANEL_NODE_ENV_PATH" <<'REMOTE'
set -euo pipefail
archive="$1"
app_path="$2"
node_env_path="$3"
trap 'rm -f "$archive"' EXIT

test -d "$app_path"
test -f "$node_env_path"
tar -xzf "$archive" --no-same-owner -C "$app_path"
cd "$app_path"
source "$node_env_path"
npm install --omit=dev
mkdir -p tmp
touch tmp/restart.txt
REMOTE

for attempt in {1..12}; do
  if response="$(curl --fail --silent --show-error "$CPANEL_HEALTH_URL")" && [[ "$response" == *'"ok":true'* ]]; then
    printf 'Deploy concluído; health check respondeu: %s\n' "$response"
    exit 0
  fi
  printf 'Aguardando a aplicação reiniciar (%s/12)...\n' "$attempt"
  sleep 5
done

printf 'Deploy enviado, mas o health check não confirmou a aplicação.\n' >&2
exit 1