# DiviAkhaaa (`divia-ui-ux`)

Plateforme communautaire et temps réel dédiée aux usagers du réseau de transport **Divia (Dijon)** :
- **`/mobile`** : Application mobile React Native / Expo (TypeScript strict)
- **`/server`** : Backend API Express + passerelle temps réel Socket.io (TypeScript strict)

---

## Démarrage rapide — Wi-Fi Direct (Mode LAN pur, sans tunnel et sans compte Expo)

Lorsque le PC Linux et les téléphones sont connectés au **même réseau Wi-Fi**, lancez toute la stack en **une seule commande** :

```bash
./scripts/start-wifi.sh
```

Ce script automatisé :
1. Détecte la vraie adresse IPv4 Wi-Fi du PC Linux (`ip -4 route get 1.1.1.1`, en ignorant Docker `172.17.*` et `127.0.0.1`).
2. Vérifie le pare-feu Linux (`ufw`) et affiche la commande exacte si les ports `8081` ou `3000` sont bloqués (`sudo ufw allow 8081/tcp && sudo ufw allow 3000/tcp`).
3. Exécute `npx expo logout` silencieusement pour que le QR code soit scannable par **n'importe quel téléphone** sans compte Expo.
4. Démarre le backend `/server` sur `0.0.0.0:3000`, vérifie `http://<WIFI_IP>:3000/health` (`200 OK`), puis lance `REACT_NATIVE_PACKAGER_HOSTNAME=<WIFI_IP> npx expo start --lan --clear`.
5. L'application mobile résout automatiquement `http://<WIFI_IP>:3000` depuis Expo Go tant que `EXPO_PUBLIC_API_URL=` reste vide dans `mobile/.env` et affiche `[Network] Backend cible : http://<WIFI_IP>:3000`.

> Pour vérifier la chaîne Wi-Fi + pare-feu + backend sans démarrer Expo : `./scripts/start-wifi.sh --check-only`.

---

## Mode École — Wi-Fi isolé (Tunnel HTTPS)

Sur un réseau Wi-Fi isolé où les clients ne peuvent pas communiquer entre eux en LAN :

```bash
./scripts/start-school.sh
```

Ce script démarre le backend sur `0.0.0.0:3000`, ouvre un tunnel HTTPS gratuit (`localhost.run` avec fallback automatique `cloudflared` / `localtunnel` sur le port `443` si le port SSH `22` est bloqué), injecte `EXPO_PUBLIC_API_URL` dans `mobile/.env` et lance `npx expo start --tunnel --clear`.

> Astuce : `TUNNEL_PROVIDER=localtunnel ./scripts/start-school.sh` pour passer directement sur le port `443`.

---

## Développement manuel

### 1. Backend (`/server`)
```bash
cd server
cp .env.example .env
npm install
npm run dev
```

### 2. Mobile (`/mobile`)
```bash
cd mobile
cp .env.example .env
npm install
npx expo start --lan
```

---

## Déploiement Cloud en 1 clic (Render.com)

Un blueprint [`render.yaml`](./render.yaml) est inclus à la racine du dépôt pour déployer gratuitement le service Docker `/server` sur **Render.com** :
- Build Docker multi-stage (`server/Dockerfile`)
- Healthcheck automatique sur `/health`
- Port `3000` et écoute `0.0.0.0` + `trust proxy` activé
- Variables secrètes (`GOOGLE_MAPS_API_KEY`, `CORS_ORIGIN`) à renseigner dans le dashboard Render (jamais committées)

---

## Vérifications qualité & CI

Avant tout commit ou PR, exécuter dans `/server` et `/mobile` :

```bash
npm run lint
npx tsc --noEmit
npm test
```
