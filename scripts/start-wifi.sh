#!/usr/bin/env bash
# ==============================================================================
# DiviAkhaaa — Lanceur Wi-Fi Direct (Mode LAN pur, zéro tunnel, sans compte Expo)
# 1. Détecte la vraie IPv4 Wi-Fi Linux (ignore Docker 172.17.* et loopback).
# 2. Diagnostique le pare-feu Linux (ufw) pour les ports 8081 et 3000.
# 3. Déconnecte silencieusement tout compte Expo (QR code ouvert à tous).
# 4. Démarre le backend sur 0.0.0.0:3000 et vérifie http://<WIFI_IP>:3000/health.
# 5. Lance Expo Go en mode --lan --clear sur la carte Wi-Fi.
# ==============================================================================

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVER_DIR="$ROOT_DIR/server"
MOBILE_DIR="$ROOT_DIR/mobile"
MOBILE_ENV="$MOBILE_DIR/.env"
PORT="${PORT:-3000}"
CHECK_ONLY=0

if [[ "${1:-}" == "--check-only" ]]; then
  CHECK_ONLY=1
fi

RED='\033[1;31m'
YELLOW='\033[1;33m'
GREEN='\033[1;32m'
CYAN='\033[1;36m'
RESET='\033[0m'

SERVER_PID=""
SERVER_LOG="$(mktemp -t diviakhaaa-wifi-server.XXXXXX.log)"

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
  echo -e "${CYAN}[Mode Wi-Fi LAN]${RESET} Arrêt propre des services..."

  if [[ -n "$SERVER_PID" ]]; then
    kill_tree "$SERVER_PID"
    wait "$SERVER_PID" 2>/dev/null || true
  fi

  rm -f "$SERVER_LOG"
  echo -e "${GREEN}[Mode Wi-Fi LAN]${RESET} Processus nettoyés."
  exit "$exit_code"
}

trap cleanup EXIT INT TERM

for cmd in ip awk node npm npx curl; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo -e "${RED}[Erreur]${RESET} Commande requise introuvable : $cmd" >&2
    exit 1
  fi
done

is_valid_lan_ip() {
  local candidate="$1"
  [[ -n "$candidate" ]] \
    && [[ "$candidate" != 127.* ]] \
    && [[ "$candidate" != 172.17.* ]] \
    && [[ "$candidate" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]]
}

detect_wifi_ip() {
  local ip_addr=""

  # Méthode principale : IP source de la route réseau active
  ip_addr="$(
    ip -4 route get 1.1.1.1 2>/dev/null \
      | awk '{for(i=1;i<=NF;i++) if ($i=="src") { print $(i+1); exit }}' || true
  )"
  if is_valid_lan_ip "$ip_addr"; then
    echo "$ip_addr"
    return 0
  fi

  # Fallback : interfaces physiques Wi-Fi (wl*) puis autres interfaces non virtuelles
  ip_addr="$(
    ip -4 -o addr show scope global up 2>/dev/null \
      | awk '$2 ~ /^wl/ { split($4, a, "/"); print a[1]; exit }' || true
  )"
  if is_valid_lan_ip "$ip_addr"; then
    echo "$ip_addr"
    return 0
  fi

  ip_addr="$(
    ip -4 -o addr show scope global up 2>/dev/null \
      | awk '$2 !~ /^(lo|docker|br-|veth|virbr|tun|tap)/ { split($4, a, "/"); print a[1] }' \
      | while IFS= read -r cand; do
          if is_valid_lan_ip "$cand"; then
            echo "$cand"
            break
          fi
        done || true
  )"
  if is_valid_lan_ip "$ip_addr"; then
    echo "$ip_addr"
    return 0
  fi

  return 1
}

check_ufw_firewall() {
  if ! command -v ufw >/dev/null 2>&1; then
    echo -e "${GREEN}[Pare-feu]${RESET} ufw non installé — aucune règle ufw bloquante détectée."
    return 0
  fi

  local ufw_out=""
  ufw_out="$(sudo -n ufw status 2>/dev/null || ufw status 2>/dev/null || true)"

  if [[ -z "$ufw_out" ]]; then
    if command -v systemctl >/dev/null 2>&1 && systemctl is-active --quiet ufw 2>/dev/null; then
      echo -e "${YELLOW}[Alerte Pare-feu]${RESET} ufw semble actif mais nécessite sudo pour lire les règles."
      echo -e "${YELLOW}                  Si le téléphone ne charge pas l'app, exécute :${RESET}"
      echo -e "                  ${RED}sudo ufw allow 8081/tcp && sudo ufw allow 3000/tcp${RESET}"
    else
      echo -e "${GREEN}[Pare-feu]${RESET} ufw inactif."
    fi
    return 0
  fi

  if echo "$ufw_out" | grep -qiE 'Status:\s*active|État\s*:\s*actif'; then
    local has_8081=0
    local has_3000=0

    if echo "$ufw_out" | grep -qE '(^|[[:space:]])8081(/tcp)?[[:space:]].*ALLOW'; then
      has_8081=1
    fi
    if echo "$ufw_out" | grep -qE '(^|[[:space:]])3000(/tcp)?[[:space:]].*ALLOW'; then
      has_3000=1
    fi

    if [[ "$has_8081" -ne 1 || "$has_3000" -ne 1 ]]; then
      echo -e "${RED}============================================================${RESET}"
      echo -e "${RED}[ALERTE PARE-FEU UFW]${RESET} Les ports Expo (8081) et/ou API (3000) ne sont pas ouverts !"
      echo -e "${YELLOW}Exécute cette commande dans un terminal pour autoriser les téléphones sur le Wi-Fi :${RESET}"
      echo -e "  ${CYAN}sudo ufw allow 8081/tcp && sudo ufw allow 3000/tcp${RESET}"
      echo -e "${RED}============================================================${RESET}"
    else
      echo -e "${GREEN}[Pare-feu]${RESET} ufw actif : ports 8081/tcp et 3000/tcp déjà ouverts."
    fi
  else
    echo -e "${GREEN}[Pare-feu]${RESET} ufw inactif."
  fi
}

clear_stale_tunnel_env() {
  if [[ -f "$MOBILE_ENV" ]] && grep -qE '^EXPO_PUBLIC_API_URL=https?://.*\.(lhr\.life|loca\.lt|ngrok|trycloudflare\.com)' "$MOBILE_ENV"; then
    local tmp_file
    tmp_file="$(mktemp)"
    awk '
      /^EXPO_PUBLIC_API_URL=/ { print "EXPO_PUBLIC_API_URL="; next }
      { print }
    ' "$MOBILE_ENV" > "$tmp_file"
    mv "$tmp_file" "$MOBILE_ENV"
    echo -e "${YELLOW}[Env]${RESET} Ancienne URL de tunnel nettoyée dans mobile/.env (retour en découverte LAN auto)."
  fi
}

echo -e "${CYAN}============================================================${RESET}"
echo -e "${CYAN}  DiviAkhaaa — Démarrage Wi-Fi Direct (Mode LAN pur)${RESET}"
echo -e "${CYAN}============================================================${RESET}"

# 1. Détection de la vraie IP Wi-Fi Linux
WIFI_IP="$(detect_wifi_ip || true)"
if [[ -z "$WIFI_IP" ]]; then
  echo -e "${RED}[Erreur]${RESET} Impossible de détecter une adresse IPv4 locale Wi-Fi/LAN valide." >&2
  exit 1
fi
HEALTH_URL="http://${WIFI_IP}:${PORT}/health"
echo -e "${GREEN}[1/4]${RESET} IP Wi-Fi détectée : ${CYAN}${WIFI_IP}${RESET} (API : http://${WIFI_IP}:${PORT})"

# 2. Diagnostic pare-feu ufw & nettoyage éventuelle URL de tunnel
check_ufw_firewall
clear_stale_tunnel_env

# 3. Déconnexion silencieuse Expo (QR code ouvert à tous les téléphones sans compte)
echo -e "${GREEN}[2/4]${RESET} Ouverture d'Expo sans compte personnel (npx expo logout)..."
(cd "$MOBILE_DIR" && npx expo logout >/dev/null 2>&1) || true

# 4. Démarrage du backend sur 0.0.0.0:3000 et attente de http://<WIFI_IP>:3000/health
if curl -fsS -m 2 -o /dev/null "$HEALTH_URL" 2>/dev/null; then
  echo -e "${GREEN}[3/4]${RESET} Backend déjà actif et joignable sur ${HEALTH_URL} -> 200 OK"
else
  echo -e "${GREEN}[3/4]${RESET} Démarrage du backend (/server) sur 0.0.0.0:${PORT}..."
  (
    cd "$SERVER_DIR"
    exec env HOST=0.0.0.0 PORT="$PORT" npm run dev
  ) > "$SERVER_LOG" 2>&1 &
  SERVER_PID=$!

  ready=0
  for _ in $(seq 1 60); do
    if ! kill -0 "$SERVER_PID" 2>/dev/null; then
      echo -e "${RED}[Erreur]${RESET} Le serveur backend s'est arrêté prématurément :" >&2
      cat "$SERVER_LOG" >&2
      exit 1
    fi

    http_code="$(curl -s -m 2 -o /dev/null -w '%{http_code}' "$HEALTH_URL" || true)"
    if [[ "$http_code" == "200" ]]; then
      ready=1
      break
    fi
    sleep 0.5
  done

  if [[ "$ready" -ne 1 ]]; then
    echo -e "${RED}[Erreur]${RESET} Timeout : ${HEALTH_URL} n'a pas répondu 200 OK après 30s." >&2
    cat "$SERVER_LOG" >&2
    exit 1
  fi

  echo -e "${GREEN}[3/4]${RESET} Backend prêt : ${HEALTH_URL} -> 200 OK"
fi

if [[ "$CHECK_ONLY" -eq 1 ]]; then
  echo -e "${GREEN}[4/4]${RESET} Mode --check-only : IP Wi-Fi (${WIFI_IP}), pare-feu, Expo logout et backend vérifiés."
  exit 0
fi

# 5. Lancement Expo en mode LAN pur forcé sur la carte Wi-Fi
echo -e "${GREEN}[4/4]${RESET} Lancement d'Expo Go en mode LAN pur sur ${CYAN}${WIFI_IP}${RESET}..."
echo "      Scanne le QR code avec n'importe quel téléphone sur le même Wi-Fi."
echo "      Appuie sur Ctrl+C pour arrêter proprement Expo et le backend."
cd "$MOBILE_DIR"
REACT_NATIVE_PACKAGER_HOSTNAME="$WIFI_IP" EXPO_PUBLIC_API_URL="" npx expo start --lan --clear
