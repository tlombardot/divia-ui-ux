# Constitution Technique & Règles de Gouvernance — DiviAkhaaa

Ce document définit les standards d'ingénierie obligatoires pour le projet **DiviAkhaaa**. Toutes les contributions, modifications d'architecture, revues de code et automatisations doivent strictement s'y conformer.

---

## 1. Vision du Projet & Stack Cible

**DiviAkhaaa** est une plateforme communautaire et temps réel dédiée aux usagers du réseau de transport Divia (Dijon) :
- **`/mobile`** : Application mobile native développée avec **React Native / Expo** en **TypeScript strict**.
- **`/server`** : Backend d'API et passerelle temps réel basé sur **Node.js / Express / Socket.io** en **TypeScript strict**.

---

## 2. Architecture Monorepo Propre

### 2.1. Séparation Stricte des Espaces
- L'arborescence racine sépare formellement `/mobile` et `/server`.
- Aucun couplage sauvage ou importation relative transversale hors packages ou contrats partagés.
- Chaque sous-projet possède ses propres configurations (`package.json`, `tsconfig.json`, linters, tests et variables d'environnement).

### 2.2. Clean Architecture & Découplage UI / Métier
- **Composants d'affichage ("Dumb / Presentational Components")** :
  - Dédiés exclusivement au rendu visuel et aux styles.
  - Zéro logique métier, calcul de trajectoire, requête réseau directe ou manipulation de socket dans le JSX des composants.
- **Logique Métier & État** :
  - Encapsulée dans des hooks personnalisés (`useRouteCalculation`, `useReportFeed`), des services dédiés ou des couches use-cases isolées.
  - Testable unitairement sans instancier le moteur de rendu React.

---

## 3. Sécurité de Production & Gestion des Secrets (OWASP Top 10)

### 3.1. Secrets & Environnement
- **Interdiction absolue** de committer des clés API, tokens de session/JWT, mots de passe, certificats ou URLs d'infrastructures privées dans le code source.
- Utilisation stricte de variables d'environnement chargées via `.env`.
- Tout ajout de variable d'environnement doit obligatoirement être documenté dans le fichier `.env.example` correspondant sans valeur sensible.

### 3.2. Validation Stricte des Entrées (Serveur & Sockets)
- Toutes les routes HTTP (Express) et tous les événements entrants (Socket.io) doivent valider et contraindre leurs charges utiles (payloads) via des schémas stricts (ex. `zod`).
- **Signalements d'incidents / contrôles / perturbations** :
  - Sanitation rigoureuse des données textuelles contre les injections (XSS, NoSQL, SQL).
  - Validation géométrique stricte des coordonnées géographiques (latitude, longitude dans la métropole dijonnaise).
- **Protection Anti-Spam & DoS** :
  - Rate-limiting obligatoire au niveau des connexions et des messages Socket.io.
  - Limitation du nombre de signalements autorisés par utilisateur/IP sur une fenêtre de temps glissante.

### 3.3. Réseau & CORS
- Configuration stricte des origines CORS autorisées (jamais de `*` en production).
- En-têtes de sécurité HTTP configurés via `helmet`.

---

## 4. Qualité du Code, Typage & Vérifications

### 4.1. TypeScript Strict
- Configuration obligatoire avec `"strict": true`, `"noImplicitAny": true`, `"strictNullChecks": true`.
- **Prodiction du mot-clé `any`** : tout usage non justifié est refusé. Utiliser `unknown` combiné à des gardes de type (type guards) ou des unions discriminées.

### 4.2. Tests Automatisés sur la Logique Critique
- Tests unitaires et d'intégration obligatoires pour :
  - **Calcul d'itinéraires** : algorithmes de calcul de trajets, correspondances tram/bus, tolérance aux retards.
  - **Gestion du cycle de vie des signalements (TTL 40 minutes)** :
    - Tout signalement communautaire a une durée de vie maximale (TTL) de **40 minutes**.
    - Vérification systématique de la purge, du statut d'expiration et de l'invalidation dans le cache et la diffusion Socket.io.
- Couverture ciblée prioritairement sur les cas limites (edge cases) et la résilience aux pannes réseaux.

### 4.3. Protocole de Validation Avant Fin de Tâche
Avant toute validation ou merge, la séquence de contrôle suivante doit passer à 100% sans erreur ni warning bloquant :
1. **Linter** : `npm run lint`
2. **Typecheck** : `npx tsc --noEmit`
3. **Tests** : `npm test`

---

## 5. Hygiène Git & Workflow CI/CD

### 5.1. Conventional Commits
Les messages de commit doivent impérativement respecter le standard Conventional Commits :
- `feat:` : Nouvelle fonctionnalité utilisateur ou API.
- `fix:` : Correction de bug.
- `chore:` : Maintenance, mise à jour de dépendances, configuration tooling.
- `ci:` : Modifications des pipelines CI/CD et workflows GitHub Actions.
- `test:` : Ajout ou refonte de tests automatisés.
- `refactor:` : Remaniement de code sans changement de comportement externe.
- `docs:` : Documentation technique.

### 5.2. Pipeline d'Intégration Continue (CI)
- Chaque Pull Request et push sur la branche `main` déclenche le pipeline `.github/workflows/ci.yml`.
- Deux jobs parallèles exécutés en fail-fast (`server-check` et `mobile-check`) valident :
  1. L'installation propre des dépendances (`npm ci`).
  2. L'audit de vulnérabilités de dépendances (`npm audit --audit-level=high`).
  3. L'absence d'erreurs de typage (`tsc --noEmit`).
  4. La conformité du linter.
  5. Le passage de l'ensemble de la suite de tests.
