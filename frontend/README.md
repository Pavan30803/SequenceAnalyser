# Sequence Analyser Frontend

React/Vite frontend for the Production Planning and Control Sequence Analyser.

For full project documentation, workflow details, file requirements, and troubleshooting, see the root [`README.md`](../README.md).

## Commands

```powershell
npm install
npm run dev
npm run build
npm run lint
npm run preview
```

The Vite dev server proxies `/api` to the Flask backend at `http://127.0.0.1:5050`.

## Current UI Capabilities

- Landing page for Prime Sequence Analyser.
- Dedicated HDT and MDT analyzer tabs.
- Opening and MOD report analytics views.
- Shortage mapping from multi-file part uploads.
- Engine and transmission status report upload.
- Skip/hold reason and outlook entry.
- Browser workspace persistence via IndexedDB.
- CSV exports for preview, hold orders, and skip orders.
