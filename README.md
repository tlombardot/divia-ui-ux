# DiviAkhaaa (`divia-ui-ux`)

Plateforme communautaire et temps réel dédiée aux usagers du réseau de transport **Divia (Dijon)** :
- **`/mobile`** : Application mobile React Native / Expo (TypeScript strict)
- **`/server`** : Backend API Express + passerelle temps réel Socket.io (TypeScript strict)

---

## Démarrage rapide — Mode École (Wi-Fi isolé / Tunnel HTTPS)

Sur un réseau Wi-Fi d'école ou d'entreprise où l'isolation client empêche le téléphone de joindre directement l'IP locale du PC, lancez l'ensemble de la stack en **une seule commande** :

```bash
./scripts/start-school.sh
```

Ce script automatisé :
1. Démarre le backend `/server` sur `0.0.0.0:3000` et attend que `http://127.0.0.1:3000/health` réponde `200 OK`.
2. Ouvre un tunnel HTTPS gratuit sans compte via `localhost.run` (`ssh -o StrictHostKeyChecking=no -R 80:127.0.0.1:3000 nokey@localhost.run`).
3. Capture automatiquement l'URL `https://...lhr.life` générée et met à jour `EXPO_PUBLIC_API_URL` dans `mobile/.env`.
4. Lance `npx expo start --tunnel --clear` dans `/mobile` et arrête proprement tous les processus sur `Ctrl+C`.

---

## Développement local (réseau domestique)

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
npx expo start
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
