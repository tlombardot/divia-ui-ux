# Quick Controller Report Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a fast, intuitive, 1-tap controller reporting modal with auto-geolocation stop detection and easy stop adjustment for the DiviAkhaaa mobile application.

**Architecture:** Clean architecture decoupling UI and business logic per `GEMINI.md`. Logic for distance sorting, nearest stop resolution, and payload preparation is isolated in pure utility functions (`quickReportUtils.ts`) tested with Vitest. The UI is a dedicated presentational modal (`QuickControllerModal.tsx`) integrated cleanly into `App.tsx` and `TransitMap.tsx`, interacting with `useReports` hook.

**Tech Stack:** React Native, Expo, TypeScript strict, Vitest.

**Spec:** Requirements from user feedback:
1. Simplify controller reporting.
2. 1-tap floating report button opening a focused popup with the nearest stop detected by geolocation.
3. Allow switching the stop easily if geolocation is inaccurate.
4. Fast submission adhering to 40-minute TTL and Conventional Commits workflow.

## Global Constraints
- Clean Architecture: No direct network or socket operations inside React component JSX.
- TypeScript strict (`"noImplicitAny": true`, `"strictNullChecks": true`, no unjustified `any`).
- 40-minute TTL for community controller reports.
- Tests, linter, and typecheck must pass at 100% before each commit.
- Never commit to `main`; work exclusively on branch `feat/quick-controller-report`.

## Review Focus
1. User location has no nearby stops within 500m (edge-case: far outside Dijon): gracefully fallback to nearest network hub (Darcy/Gare) with clear distance indicator.
2. Stop has multiple lines (e.g. Darcy with T1, T2, L3, L5): allow quick selection or default to "Toutes lignes (à quai)".
3. Rapid double-tap on submit: button debounce / state lock to prevent duplicate report emissions.
4. GPS accuracy variation: instant stop search input allowing selection of any Dijon network station with zero lag.
5. Success feedback: auto-close with haptic feedback and clear confirmation text.

---

### Task 1: Pure Logic Utilities for Quick Reporting (`quickReportUtils`)

**Files:**
- Create: `mobile/src/utils/quickReportUtils.ts`
- Test: `mobile/src/__tests__/quickReportUtils.test.ts`

**Interfaces:**
- Produces:
  - `getNearestStops(userLat: number, userLng: number, stops: TransitStop[], limit?: number): Array<{ stop: TransitStop; distanceMeters: number; formattedDistance: string }>`
  - `formatStopDistance(meters: number): string`
  - `resolveDefaultLineId(stop: TransitStop): string`
  - `buildQuickControllerPayload(stop: TransitStop, lineId: string, description?: string): CreateReportPayload`

- [x] **Step 1: Write failing unit tests for quick reporting utilities**
  Create `mobile/src/__tests__/quickReportUtils.test.ts` testing:
  - `getNearestStops` correctly ranks stops by Haversine distance and formats distance ("25 m", "1.2 km").
  - `resolveDefaultLineId` prioritizes Tram lines (T1/T2) or first available line, or 'ALL'.
  - `buildQuickControllerPayload` structures the payload with 40-minute TTL expectations, stop coordinates, and direction labels.

- [x] **Step 2: Run test to verify it fails**
  Run: `cd mobile && npx vitest run src/__tests__/quickReportUtils.test.ts`
  Expected: FAIL with missing module `quickReportUtils`.

- [x] **Step 3: Implement `quickReportUtils.ts`**
  Implement pure functions in `mobile/src/utils/quickReportUtils.ts` using existing `calculateDistanceMeters` and `ALL_DIJON_STOPS`.

- [x] **Step 4: Run test to verify it passes**
  Run: `cd mobile && npx vitest run src/__tests__/quickReportUtils.test.ts`
  Expected: PASS

- [x] **Step 5: Verify typecheck & lint**
  Run: `cd mobile && npm run typecheck && npm run lint`

- [x] **Step 6: Commit**
  Run: `git add mobile/src/utils/quickReportUtils.ts mobile/src/__tests__/quickReportUtils.test.ts`
  `git commit -m "feat(mobile): add quick report calculation and formatting utilities"`

---

### Task 2: Dedicated 1-Tap Quick Controller Modal (`QuickControllerModal`)

**Files:**
- Create: `mobile/src/components/reports/QuickControllerModal.tsx`
- Modify: `mobile/src/components/reports/index.ts` (if existing, or export directly)
- Test: `mobile/src/__tests__/quickControllerModal.test.ts`

**Interfaces:**
- Consumes:
  - `quickReportUtils.ts` (`getNearestStops`, `resolveDefaultLineId`, `buildQuickControllerPayload`)
  - `COLORS` from `mobile/src/theme/colors.ts`
  - `TransitStop`, `UserLocation` from `mobile/src/types`
- Produces:
  - `export const QuickControllerModal: React.FC<QuickControllerModalProps>`
  - Props:
    ```typescript
    interface QuickControllerModalProps {
      visible: boolean;
      userLocation: UserLocation;
      initialStop?: TransitStop | null;
      onClose: () => void;
      onSubmitReport: (payload: CreateReportPayload) => Promise<unknown> | void;
    }
    ```

- [x] **Step 1: Write failing tests for QuickControllerModal**
  Create `mobile/src/__tests__/quickControllerModal.test.ts` testing:
  - Modal displays nearest stop name and distance based on `userLocation`.
  - Calling submit emits the controller report payload for the active stop.
  - Selecting an alternative stop from nearby suggestions switches the target stop.
  - Double submit is prevented while confirmation or submit is pending.

- [x] **Step 2: Run test to verify it fails**
  Run: `cd mobile && npx vitest run src/__tests__/quickControllerModal.test.ts`
  Expected: FAIL (component not found).

- [x] **Step 3: Implement `QuickControllerModal.tsx`**
  Build clean, centered / compact dialog:
  - Header with title: "🚨 Signaler des contrôleurs" and close button.
  - Prominent stop banner: "📍 Arrêt détecté : **[Stop Name]** (à [Distance])".
  - "Changer d'arrêt" toggle showing nearby chips + search input if needed.
  - Line selector pills (e.g. T1, T2, Toutes lignes).
  - Prominent 1-Tap CTA button: "🚨 Confirmer le signalement (40 min)".
  - Confirmation state with green checkmark and auto-dismiss after 1s.

- [x] **Step 4: Run test to verify it passes**
  Run: `cd mobile && npx vitest run src/__tests__/quickControllerModal.test.ts`
  Expected: PASS

- [x] **Step 5: Verify typecheck & lint**
  Run: `cd mobile && npm run typecheck && npm run lint`

- [x] **Step 6: Commit**
  Run: `git add mobile/src/components/reports/QuickControllerModal.tsx mobile/src/__tests__/quickControllerModal.test.ts`
  `git commit -m "feat(mobile): create intuitive 1-tap QuickControllerModal component"`

---

### Task 3: App & TransitMap Integration

**Files:**
- Modify: `mobile/App.tsx`
- Modify: `mobile/src/components/map/TransitMap.tsx`
- Modify: `mobile/src/components/sheet/StationDetailContent.tsx` (if needed)

**Interfaces:**
- Connects `QuickControllerModal` to `createReport` from `useReports()`.
- Wires the floating action button 🚨 in `TransitMap.tsx` directly to the new `QuickControllerModal`.
- Keeps `ReportBottomSheet` available for crowd affluence or transitions smoothly.

- [x] **Step 1: Update App.tsx to wire QuickControllerModal**
  - Import `QuickControllerModal`.
  - Connect `isReportModalVisible`, `reportTargetStop`, and `createReport`.
  - Ensure pressing the map FAB 🚨 opens `QuickControllerModal` with the user's real GPS position.

- [x] **Step 2: Verify existing mobile test suites**
  Run: `cd mobile && npm test`
  Expected: All test suites PASS (including `mobileLogic`, `favoritesAndCrowd`, `controllerTracking`, etc.).

- [x] **Step 3: Verify end-to-end lint, typecheck, and server tests**
  Run: `cd mobile && npm run typecheck && npm run lint`
  Run: `cd server && npm test && npx tsc --noEmit && npm run lint`
  Expected: Zero errors.

- [x] **Step 4: Commit integration changes**
  Run: `git add mobile/App.tsx mobile/src/components/map/TransitMap.tsx`
  `git commit -m "feat(mobile): wire QuickControllerModal to map FAB and station detail"`

---

### Task 4: Full Validation & CI Readiness Verification

**Files:**
- Entire repository verification (`server` and `mobile`).

- [x] **Step 1: Run complete mobile verification suite**
  Run: `cd mobile && npm test && npm run typecheck && npm run lint`
  Expected: 100% pass.

- [x] **Step 2: Run complete server verification suite**
  Run: `cd server && npm test && npx tsc --noEmit && npm run lint`
  Expected: 100% pass.

- [x] **Step 3: Final git status and log check**
  Run: `git status && git log -n 5 --oneline`
  Ensure clean branch `feat/quick-controller-report` ready for PR.
