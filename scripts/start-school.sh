#!/usr/bin/env bash
# ==============================================================================
# DiviAkhaaa — Lanceur "Mode École" (1 commande)
# Démarre le backend sur 0.0.0.0:3000, ouvre un tunnel HTTPS gratuit via
# localhost.run, injecte EXPO_PUBLIC_API_URL dans mobile/.env et lance Expo Go
# en mode --tunnel --clear. Nettoie tous les processus à l'arrêt (Ctrl+C).
# ==============================================================================

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVER_DIR="$ROOT_DIR/server"
MOBILE_DIR="$ROOT_DIR/mobile"
MOBILE_ENV="$MOBILE_DIR/.env"
PORT="${PORT:-3000}"
HEALTH_URL="http://127.0.0.1:${PORT}/health"

SERVER_PID=""
TUNNEL_PID=""
SERVER_LOG="$(mktemp -t diviakhaaa-server.XXXXXX.log)"
TUNNEL_LOG="$(mktemp -t diviakhaaa-tunnel.XXXXXX.log)"

cleanup() {
  local exit_code=$?
  echo ""
  echo "[Mode École] Arrêt propre des services..."

  if [[ -n "$TUNNEL_PID" ]] && kill -0 "$TUNNEL_PID" 2>/dev/null; then
    kill "$TUNNEL_PID" 2>/dev/null || true
    wait "$TUNNEL_PID" 2>/dev/null || true
  fi

  if [[ -n "$SERVER_PID" ]] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi

  rm -f "$SERVER_LOG" "$TUNNEL_LOG"
  echo "[Mode École] Processus nettoyés."
  exit "$exit_code"
}

trap cleanup EXIT INT TERM

for cmd in node npm ssh curl; do
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
    HOST=0.0.0.0 PORT="$PORT" npm run dev
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

# 2. Ouvrir le tunnel SSH gratuit sans compte via localhost.run
echo "[2/4] Ouverture du tunnel HTTPS (localhost.run -> 127.0.0.1:${PORT})..."
ssh \
  -o StrictHostKeyChecking=no \
  -o ServerAliveInterval=30 \
  -o ServerAliveCountMax=3 \
  -o ExitOnForwardFailure=yes \
  -R "80:127.0.0.1:${PORT}" \
  nokey@localhost.run > "$TUNNEL_LOG" 2>&1 &
TUNNEL_PID=$!

TUNNEL_URL=""
for _ in $(seq 1 60); do
  if ! kill -0 "$TUNNEL_PID" 2>/dev/null; then
    echo "[Erreur] Le tunnel SSH localhost.run s'est fermé :" >&2
    cat "$TUNNEL_LOG" >&2
    exit 1
  fi

  candidate="$(
    sed -E 's/\x1B\[[0-9;]*[mK]//g' "$TUNNEL_LOG" 2>/dev/null \
      | tr -d '\r' \
      | grep -Eo 'https://[a-zA-Z0-9.-]+\.lhr\.life' \
      | head -n 1 || true
  )"
  if [[ -n "$candidate" ]]; then
    TUNNEL_URL="$candidate"
    break
  fi
  sleep 0.5
done

if [[ -z "$TUNNEL_URL" ]]; then
  echo "[Erreur] Impossible de capturer l'URL https://...lhr.life après 30s." >&2
  cat "$TUNNEL_LOG" >&2
  exit 1
fi

echo "[2/4] Tunnel actif : $TUNNEL_URL"

# Vérification rapide bout-en-bout du tunnel
if curl -fsS -m 5 "${TUNNEL_URL}/health" >/dev/null 2>&1; then
  echo "[2/4] Vérification bout-en-bout OK (${TUNNEL_URL}/health -> 200)"
else
  echo "[Info] Le tunnel est ouvert (${TUNNEL_URL}), propagation DNS/TLS en cours..."
fi

# 3. Mettre à jour mobile/.env
echo "[3/4] Mise à jour de EXPO_PUBLIC_API_URL dans mobile/.env..."
update_env_var "$MOBILE_ENV" "EXPO_PUBLIC_API_URL" "$TUNNEL_URL"
if grep -qE '^EXPO_PUBLIC_SOCKET_URL=' "$MOBILE_ENV" 2>/dev/null; then
  update_env_var "$MOBILE_ENV" "EXPO_PUBLIC_SOCKET_URL" "$TUNNEL_URL"
fi
echo "[3/4] mobile/.env configuré avec EXPO_PUBLIC_API_URL=${TUNNEL_URL}"

# 4. Lancer Expo Go en mode tunnel
echo "[4/4] Lancement d'Expo Go (--tunnel --clear)..."
echo "      Appuie sur Ctrl+C pour arrêter proprement Expo, le tunnel et le backend."
cd "$MOBILE_DIR"
EXPO_PUBLIC_API_URL="$TUNNEL_URL" npx expo start --tunnel --clear
