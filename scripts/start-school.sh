#!/usr/bin/env bash
# ==============================================================================
# DiviAkhaaa — Lanceur "Mode École" (1 commande)
# Démarre le backend sur 0.0.0.0:3000, ouvre un tunnel HTTPS gratuit sans compte
# (localhost.run -> fallback automatique cloudflared / localtunnel sur port 443
# si le port SSH 22 est bloqué par le pare-feu de l'école), injecte
# EXPO_PUBLIC_API_URL dans mobile/.env et lance Expo Go (--tunnel --clear).
# Nettoie proprement tous les processus à l'arrêt (Ctrl+C).
# ==============================================================================

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVER_DIR="$ROOT_DIR/server"
MOBILE_DIR="$ROOT_DIR/mobile"
MOBILE_ENV="$MOBILE_DIR/.env"
PORT="${PORT:-3000}"
HEALTH_URL="http://127.0.0.1:${PORT}/health"
TUNNEL_PROVIDER="${TUNNEL_PROVIDER:-auto}" # auto | localhost.run | cloudflared | localtunnel
CHECK_ONLY=0

if [[ "${1:-}" == "--check-only" ]]; then
  CHECK_ONLY=1
fi

SERVER_PID=""
TUNNEL_PID=""
SERVER_LOG="$(mktemp -t diviakhaaa-server.XXXXXX.log)"
TUNNEL_LOG="$(mktemp -t diviakhaaa-tunnel.XXXXXX.log)"

kill_tree() {
  local pid="$1"
  if [[ -z "$pid" ]] || ! kill -0 "$pid" 2>/dev/null; then
    return 0
  fi

  local children
  children="$(pgrep -P "$pid" 2>/dev/null || true)"
  for child in $children; do
    kill_tree "$child"
  done

  kill -TERM "$pid" 2>/dev/null || true
}

cleanup() {
  local exit_code=$?
  trap - EXIT INT TERM
  echo ""
  echo "[Mode École] Arrêt propre des services..."

  if [[ -n "$TUNNEL_PID" ]]; then
    kill_tree "$TUNNEL_PID"
    wait "$TUNNEL_PID" 2>/dev/null || true
  fi

  if [[ -n "$SERVER_PID" ]]; then
    kill_tree "$SERVER_PID"
    wait "$SERVER_PID" 2>/dev/null || true
  fi

  rm -f "$SERVER_LOG" "$TUNNEL_LOG"
  echo "[Mode École] Processus nettoyés."
  exit "$exit_code"
}

trap cleanup EXIT INT TERM

for cmd in node npm npx curl; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "[Erreur] Commande requise introuvable : $cmd" >&2
    exit 1
  fi
done

update_env_var() {
  local file="$1"
  local key="$2"
  local value="$3"

  touch "$file"
  if grep -qE "^${key}=" "$file"; then
    local tmp_file
    tmp_file="$(mktemp)"
    awk -v k="$key" -v v="$value" '
      BEGIN { replaced = 0 }
      $0 ~ ("^" k "=") { print k "=" v; replaced = 1; next }
      { print }
      END { if (!replaced) print k "=" v }
    ' "$file" > "$tmp_file"
    mv "$tmp_file" "$file"
  else
    printf '\n%s=%s\n' "$key" "$value" >> "$file"
  fi
}

try_localhost_run() {
  if ! command -v ssh >/dev/null 2>&1; then
    return 1
  fi

  : > "$TUNNEL_LOG"
  echo "[2/4] Tentative tunnel SSH localhost.run (port 22 -> 127.0.0.1:${PORT})..."
  ssh \
    -T \
    -o StrictHostKeyChecking=no \
    -o BatchMode=yes \
    -o ConnectTimeout=5 \
    -o ServerAliveInterval=30 \
    -o ServerAliveCountMax=3 \
    -o ExitOnForwardFailure=yes \
    -R "80:127.0.0.1:${PORT}" \
    nokey@localhost.run -- --output json > "$TUNNEL_LOG" 2>&1 &
  TUNNEL_PID=$!

  for _ in $(seq 1 16); do
    if ! kill -0 "$TUNNEL_PID" 2>/dev/null; then
      TUNNEL_PID=""
      return 1
    fi

    local candidate
    candidate="$(
      sed -E 's/\x1B\[[0-9;]*[mK]//g' "$TUNNEL_LOG" 2>/dev/null \
        | tr -d '\r' \
        | grep -Eo 'https://[a-zA-Z0-9.-]+\.lhr\.life' \
        | head -n 1 || true
    )"
    if [[ -n "$candidate" ]]; then
      TUNNEL_URL="$candidate"
      return 0
    fi
    sleep 0.5
  done

  kill_tree "$TUNNEL_PID"
  wait "$TUNNEL_PID" 2>/dev/null || true
  TUNNEL_PID=""
  return 1
}

try_cloudflared() {
  if ! command -v cloudflared >/dev/null 2>&1; then
    return 1
  fi

  : > "$TUNNEL_LOG"
  echo "[2/4] Ouverture du tunnel HTTPS cloudflared (port 443 -> 127.0.0.1:${PORT})..."
  cloudflared tunnel --no-autoupdate --url "http://127.0.0.1:${PORT}" > "$TUNNEL_LOG" 2>&1 &
  TUNNEL_PID=$!

  for _ in $(seq 1 30); do
    if ! kill -0 "$TUNNEL_PID" 2>/dev/null; then
      TUNNEL_PID=""
      return 1
    fi

    local candidate
    candidate="$(
      sed -E 's/\x1B\[[0-9;]*[mK]//g' "$TUNNEL_LOG" 2>/dev/null \
        | tr -d '\r' \
        | grep -Eo 'https://[a-zA-Z0-9.-]+\.trycloudflare\.com' \
        | head -n 1 || true
    )"
    if [[ -n "$candidate" ]]; then
      TUNNEL_URL="$candidate"
      return 0
    fi
    sleep 0.5
  done

  kill_tree "$TUNNEL_PID"
  wait "$TUNNEL_PID" 2>/dev/null || true
  TUNNEL_PID=""
  return 1
}

try_localtunnel() {
  : > "$TUNNEL_LOG"
  echo "[2/4] Ouverture du tunnel HTTPS localtunnel (port 443 -> 127.0.0.1:${PORT})..."
  npx --yes localtunnel --port "$PORT" --local-host 127.0.0.1 > "$TUNNEL_LOG" 2>&1 &
  TUNNEL_PID=$!

  for _ in $(seq 1 40); do
    if ! kill -0 "$TUNNEL_PID" 2>/dev/null; then
      TUNNEL_PID=""
      return 1
    fi

    local candidate
    candidate="$(
      sed -E 's/\x1B\[[0-9;]*[mK]//g' "$TUNNEL_LOG" 2>/dev/null \
        | tr -d '\r' \
        | grep -Eo 'https://[a-zA-Z0-9.-]+\.loca\.lt' \
        | head -n 1 || true
    )"
    if [[ -n "$candidate" ]]; then
      TUNNEL_URL="$candidate"
      return 0
    fi
    sleep 0.5
  done

  kill_tree "$TUNNEL_PID"
  wait "$TUNNEL_PID" 2>/dev/null || true
  TUNNEL_PID=""
  return 1
}

echo "============================================================"
echo "  DiviAkhaaa — Démarrage Mode École (Tunnel HTTPS + Expo)"
echo "============================================================"

# 1. Démarrer le backend sur 0.0.0.0:3000 (ou réutiliser s'il tourne déjà)
if curl -fsS -o /dev/null "$HEALTH_URL" 2>/dev/null; then
  echo "[1/4] Backend déjà actif et joignable sur $HEALTH_URL"
else
  echo "[1/4] Démarrage du backend (/server) sur 0.0.0.0:${PORT}..."
  (
    cd "$SERVER_DIR"
    exec env HOST=0.0.0.0 PORT="$PORT" npm run dev
  ) > "$SERVER_LOG" 2>&1 &
  SERVER_PID=$!

  ready=0
  for _ in $(seq 1 60); do
    if ! kill -0 "$SERVER_PID" 2>/dev/null; then
      echo "[Erreur] Le serveur backend s'est arrêté prématurément :" >&2
      cat "$SERVER_LOG" >&2
      exit 1
    fi

    http_code="$(curl -s -o /dev/null -w '%{http_code}' "$HEALTH_URL" || true)"
    if [[ "$http_code" == "200" ]]; then
      ready=1
      break
    fi
    sleep 0.5
  done

  if [[ "$ready" -ne 1 ]]; then
    echo "[Erreur] Timeout : $HEALTH_URL n'a pas répondu 200 OK après 30s." >&2
    cat "$SERVER_LOG" >&2
    exit 1
  fi

  echo "[1/4] Backend prêt : $HEALTH_URL -> 200 OK"
fi

# 2. Ouvrir le tunnel HTTPS (avec fallback automatique si le port SSH 22 est bloqué)
TUNNEL_URL=""
case "$TUNNEL_PROVIDER" in
  localhost.run)
    try_localhost_run || true
    ;;
  cloudflared)
    try_cloudflared || true
    ;;
  localtunnel)
    try_localtunnel || true
    ;;
  auto)
    if ! try_localhost_run; then
      echo "[Info] localhost.run indisponible (port SSH 22 probablement bloqué par le Wi-Fi) — bascule sur tunnel HTTPS (port 443)..."
      if ! try_cloudflared; then
        try_localtunnel || true
      fi
    fi
    ;;
  *)
    echo "[Erreur] TUNNEL_PROVIDER inconnu : $TUNNEL_PROVIDER (attendu : auto|localhost.run|cloudflared|localtunnel)" >&2
    exit 1
    ;;
esac

if [[ -z "$TUNNEL_URL" ]]; then
  echo "[Erreur] Impossible d'ouvrir un tunnel HTTPS vers 127.0.0.1:${PORT}." >&2
  cat "$TUNNEL_LOG" >&2
  exit 1
fi

echo "[2/4] Tunnel actif : $TUNNEL_URL"

# Vérification bout-en-bout du tunnel avec les en-têtes de contournement mobile
e2e_ok=0
for _ in $(seq 1 6); do
  e2e_code="$(
    curl -s -m 5 -o /dev/null -w '%{http_code}' \
      -H 'Bypass-Tunnel-Reminder: true' \
      -H 'ngrok-skip-browser-warning: true' \
      -H 'Accept: application/json' \
      "${TUNNEL_URL}/health" || true
  )"
  if [[ "$e2e_code" == "200" ]]; then
    e2e_ok=1
    break
  fi
  sleep 1
done

if [[ "$e2e_ok" -eq 1 ]]; then
  echo "[2/4] Vérification bout-en-bout OK (${TUNNEL_URL}/health -> 200 OK)"
else
  echo "[Avertissement] ${TUNNEL_URL}/health a répondu HTTP ${e2e_code:-timeout} (propagation TLS en cours)."
fi

# 3. Mettre à jour mobile/.env
echo "[3/4] Mise à jour de EXPO_PUBLIC_API_URL dans mobile/.env..."
update_env_var "$MOBILE_ENV" "EXPO_PUBLIC_API_URL" "$TUNNEL_URL"
if grep -qE '^EXPO_PUBLIC_SOCKET_URL=' "$MOBILE_ENV" 2>/dev/null; then
  update_env_var "$MOBILE_ENV" "EXPO_PUBLIC_SOCKET_URL" "$TUNNEL_URL"
fi
echo "[3/4] mobile/.env configuré avec EXPO_PUBLIC_API_URL=${TUNNEL_URL}"

if [[ "$CHECK_ONLY" -eq 1 ]]; then
  echo "[4/4] Mode --check-only : backend + tunnel HTTPS + mobile/.env vérifiés avec succès."
  exit 0
fi

# 4. Lancer Expo Go en mode tunnel
echo "[4/4] Lancement d'Expo Go (--tunnel --clear)..."
echo "      Appuie sur Ctrl+C pour arrêter proprement Expo, le tunnel et le backend."
cd "$MOBILE_DIR"
EXPO_PUBLIC_API_URL="$TUNNEL_URL" npx expo start --tunnel --clear
