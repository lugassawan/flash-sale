# Frontend SPA Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a React SPA with Vite that displays flash sale status in real-time and handles purchases.

**Architecture:** Single-page React app with two custom hooks (`useSaleEvents` for SSE/polling, `usePurchase` for purchase API). State flows down from App.tsx via props. Types imported from `@flash-sale/shared` — no duplicates. Clean & minimal UI with system fonts, centered single-column layout.

**Tech Stack:** React 19, Vite 6, TypeScript, CSS (no framework), @flash-sale/shared types

---

### Task 1: Project scaffolding — Vite + React + dependencies

**Files:**

- Modify: `apps/frontend/package.json`
- Create: `apps/frontend/index.html`
- Create: `apps/frontend/vite.config.ts`
- Modify: `apps/frontend/tsconfig.json`
- Create: `apps/frontend/src/vite-env.d.ts`

**Step 1: Update package.json with React + Vite dependencies**

Replace `apps/frontend/package.json` with:

```json
{
  "name": "@flash-sale/frontend",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "tsc -b && vite build",
    "dev": "vite",
    "preview": "vite preview",
    "lint": "eslint \"src/**/*.{ts,tsx}\"",
    "lint:fix": "eslint \"src/**/*.{ts,tsx}\" --fix"
  },
  "dependencies": {
    "@flash-sale/shared": "workspace:*",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.3.4",
    "typescript": "^5.7.3",
    "vite": "^6.1.0"
  }
}
```

**Step 2: Create index.html (Vite entry)**

Create `apps/frontend/index.html`:

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Flash Sale</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

**Step 3: Create vite.config.ts with proxy**

Create `apps/frontend/vite.config.ts`:

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
```

**Step 4: Update tsconfig.json for Vite compatibility**

Ensure `apps/frontend/tsconfig.json` has correct settings for Vite + React.

**Step 5: Create vite-env.d.ts**

Create `apps/frontend/src/vite-env.d.ts`:

```ts
/// <reference types="vite/client" />
```

**Step 6: Install dependencies**

Run: `pnpm install` from workspace root.
Expected: Dependencies install successfully.

**Step 7: Verify Vite starts**

Run: `pnpm --filter @flash-sale/frontend dev`
Expected: Vite dev server starts on port 5173 (will show blank page — OK).

---

### Task 2: Type re-exports + API service layer

**Files:**

- Create: `apps/frontend/src/types/sale.types.ts`
- Create: `apps/frontend/src/services/api.ts`

**Step 1: Create type re-exports**

Create `apps/frontend/src/types/sale.types.ts` — re-exports from shared for convenient imports:

```ts
export type {
  ApiResponse,
  ApiError,
  SaleStatus,
  SaleInitialEvent,
  SaleStockUpdateEvent,
  SaleStateChangeEvent,
  PurchaseRecord,
  PurchaseRequest,
  PurchaseAttemptResult,
} from '@flash-sale/shared';

export { SaleState, ErrorCode } from '@flash-sale/shared';
```

**Step 2: Create typed API service**

Create `apps/frontend/src/services/api.ts` — typed fetch wrapper:

```ts
import type { ApiResponse, SaleStatus, PurchaseRecord } from '@/types/sale.types';

const BASE = '/api/v1';

export async function fetchSaleStatus(): Promise<ApiResponse<SaleStatus>> {
  const res = await fetch(`${BASE}/sales`);
  return res.json();
}

export async function attemptPurchase(
  userId: string,
  sku: string,
): Promise<ApiResponse<PurchaseRecord>> {
  const res = await fetch(`${BASE}/purchases`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-User-Id': userId,
    },
    body: JSON.stringify({ sku, qty: 1 }),
  });
  return res.json();
}

export async function fetchPurchaseStatus(userId: string): Promise<ApiResponse<PurchaseRecord>> {
  const res = await fetch(`${BASE}/purchases`, {
    headers: { 'X-User-Id': userId },
  });
  return res.json();
}
```

---

### Task 3: useSaleEvents hook — SSE + fallback polling

**Files:**

- Create: `apps/frontend/src/hooks/useSaleEvents.ts`

**Step 1: Implement SSE hook with polling fallback**

Create `apps/frontend/src/hooks/useSaleEvents.ts`:

- Opens `EventSource` to `/api/v1/sales/events`
- Handles `initial`, `stock-update`, `state-change` events
- On SSE error: falls back to polling `GET /api/v1/sales` every 2s
- Returns: `{ sale: SaleStatus | null, connected: boolean }`
- Applies 0–500ms jitter delay when transitioning to ACTIVE

---

### Task 4: usePurchase hook — purchase API + state restore

**Files:**

- Create: `apps/frontend/src/hooks/usePurchase.ts`

**Step 1: Implement purchase hook**

Create `apps/frontend/src/hooks/usePurchase.ts`:

- States: `idle` → `loading` → `success` / `error`
- `purchase(userId, sku)`: POST to API, handle response
- On mount: if userId is stored, GET `/api/v1/purchases` to restore state
- Returns: `{ status, purchase, error, submit, reset }`
- Prevents double-submit (disabled during loading)

---

### Task 5: UI components — SaleStatus, Countdown, StockCounter

**Files:**

- Create: `apps/frontend/src/components/SaleStatus.tsx`
- Create: `apps/frontend/src/components/Countdown.tsx`
- Create: `apps/frontend/src/components/StockCounter.tsx`

**Step 1: SaleStatus component**

Shows colored badge for UPCOMING (amber), ACTIVE (green), ENDED (slate).

**Step 2: Countdown component**

Displays time remaining until `startTime`. Uses `setInterval` with 1s tick. Hides when sale is not UPCOMING.

**Step 3: StockCounter component**

Displays current stock with CSS transition on number change. Shows "X of Y remaining" format.

---

### Task 6: UI components — PurchaseForm, PurchaseResult

**Files:**

- Create: `apps/frontend/src/components/PurchaseForm.tsx`
- Create: `apps/frontend/src/components/PurchaseResult.tsx`

**Step 1: PurchaseForm component**

- Text input for user ID + Buy button
- Validates non-empty/non-whitespace before submit
- Inline error message for invalid input
- Button disabled when: sale not ACTIVE, loading, already purchased
- Debounce/disable on submit to prevent double-clicks

**Step 2: PurchaseResult component**

- Maps purchase outcome to distinct visual feedback:
  - Success (green): "Purchase confirmed! Order: {purchaseNo}"
  - SOLD_OUT (red): "Sorry, all items have been sold."
  - ALREADY_PURCHASED (blue): "You've already made a purchase."
  - SALE_NOT_ACTIVE (amber): "Sale is not currently active."

---

### Task 7: App.tsx + main.tsx + styles — wire everything together

**Files:**

- Create: `apps/frontend/src/App.tsx`
- Modify: `apps/frontend/src/main.ts` → rename to `apps/frontend/src/main.tsx`
- Create: `apps/frontend/src/styles/app.css`

**Step 1: Create app.css**

Clean & minimal styles: system font stack, centered layout, max-width 480px, color-coded badges, smooth transitions.

**Step 2: Create App.tsx**

Root component that:

- Uses `useSaleEvents` for real-time sale state
- Uses `usePurchase` for purchase flow
- Renders all child components with appropriate props
- Manages userId state (persisted to sessionStorage)

**Step 3: Update main.tsx**

Rename `main.ts` → `main.tsx`, render `<App />` into `#root`.

**Step 4: Verify build**

Run: `pnpm --filter @flash-sale/frontend build`
Expected: TypeScript compiles without errors.

---

### Task 8: Final verification + cleanup

**Step 1: Verify dev server starts**

Run: `pnpm --filter @flash-sale/frontend dev`
Expected: Vite dev server on port 5173, page loads with UI.

**Step 2: Verify build succeeds**

Run: `pnpm --filter @flash-sale/frontend build`
Expected: Clean build, no errors.

**Step 3: Verify lint passes**

Run: `pnpm --filter @flash-sale/frontend lint`
Expected: No lint errors.
