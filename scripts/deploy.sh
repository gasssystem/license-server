#!/usr/bin/env bash
# Deploy do license-server na TurboCloud (cPanel) por SSH, a partir da máquina
# de quem publica — o firewall da hospedagem bloqueia SSH vindo do GitHub
# Actions, por isso não há deploy automático no push.
#
# Uso:  npm run deploy
#
# Passos: valida o código → empacota → envia por SSH → extrai na pasta da
# aplicação → npm install → npm run migrate → reinicia (Passenger) → confere
# o /health. .env, node_modules e arquivos fora do pacote não são enviados
# nem removidos no servidor.
#
# Usa a configuração SSH local (~/.ssh/config: Host 187.108.207.21, porta,
# usuário e IdentityFile). Recusa publicar com alteração não commitada, para
# o que está em produção ser sempre o que está no git (DEPLOY_FORCE=1 ignora).
set -euo pipefail

HOST="187.108.207.21"
PORTA="215"
USUARIO="gasssyst"
APP_PATH="/home/gasssyst/license-server"
NODE_ENV_PATH="/home/gasssyst/nodevenv/license-server/20/bin/activate"
HEALTH_URL="https://licencas.gasssystem.com.br/health"

cd "$(dirname "$0")/.."

if [[ -n "$(git status --porcelain -- package.json package-lock.json server.cjs public sql src)" && "${DEPLOY_FORCE:-}" != "1" ]]; then
  echo "Há alterações não commitadas no código da aplicação:" >&2
  git status --short -- package.json package-lock.json server.cjs public sql src >&2
  echo "Faça o commit antes de publicar (ou rode com DEPLOY_FORCE=1)." >&2
  exit 1
fi

echo "› Publicando $(git rev-parse --short HEAD) — $(git log -1 --format=%s)"

echo "› Validando o código"
node --check server.cjs
find src -name '*.js' -print0 | xargs -0 -n1 node --check

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
# COPYFILE_DISABLE: o tar do macOS não grava atributos estendidos (evita os
# avisos "unknown extended header" no tar do servidor).
COPYFILE_DISABLE=1 tar -czf "$tmp/deploy.tar.gz" package.json package-lock.json server.cjs public sql src

ssh_opts=(-p "$PORTA" -o BatchMode=yes -o LogLevel=ERROR)
scp_opts=(-P "$PORTA" -o BatchMode=yes -o LogLevel=ERROR)
remoto="$USUARIO@$HOST"

echo "› Enviando"
arquivo_remoto="$(ssh "${ssh_opts[@]}" "$remoto" 'mktemp /tmp/license-server-deploy.XXXXXX')"
scp "${scp_opts[@]}" "$tmp/deploy.tar.gz" "$remoto:$arquivo_remoto"

echo "› Instalando, migrando e reiniciando no servidor"
ssh "${ssh_opts[@]}" "$remoto" bash -s -- "$arquivo_remoto" "$APP_PATH" "$NODE_ENV_PATH" <<'REMOTO'
set -euo pipefail
arquivo="$1"; app_path="$2"; node_env_path="$3"
trap 'rm -f "$arquivo"' EXIT

test -d "$app_path"
test -f "$node_env_path"
tar -xzf "$arquivo" --no-same-owner -C "$app_path"
cd "$app_path"

# O activate do Node no cPanel usa variáveis que podem não existir
# (ex.: CL_VIRTUAL_ENV): com "set -u" ligado o script morreria aqui.
set +u
source "$node_env_path"
set -u

npm install --omit=dev --no-audit --no-fund
npm run migrate
mkdir -p tmp
touch tmp/restart.txt
REMOTO

echo "› Conferindo o health check"
for tentativa in {1..12}; do
  if resposta="$(curl --fail --silent --show-error --max-time 10 "$HEALTH_URL")" && [[ "$resposta" == *'"ok":true'* ]]; then
    echo "✓ Deploy concluído — $resposta"
    exit 0
  fi
  echo "  aguardando a aplicação reiniciar ($tentativa/12)…"
  sleep 5
done

echo "✗ Enviado, mas o health check não confirmou a aplicação ($HEALTH_URL)." >&2
exit 1
