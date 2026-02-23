# Vercel Environment Variables (Frontend)

Este archivo centraliza las variables para Vercel del proyecto `cre-prediction-market`.

## 1) Variables requeridas por tu solicitud

Estado actual:

| Variable | Valor recomendado para Vercel | Estado |
| --- | --- | --- |
| `NEXT_PUBLIC_SEPOLIA_RPC_URL` | `https://ethereum-sepolia-rpc.publicnode.com` | LISTO |
| `NEXT_PUBLIC_PREDICTION_MARKET_V3_ADDRESS` | `0x2565bc638ab1bFb26d86e63752bA1a3D7ee4fA28` | LISTO |
| `NEXT_PUBLIC_ORACLE_BASE_URL` | `<TU_URL_PUBLICA_DEL_ORACLE>` | PENDIENTE |
| `NEXT_PUBLIC_WC_PROJECT_ID` | `<TU_WALLETCONNECT_PROJECT_ID>` | PENDIENTE |

## 2) Bloque para copiar en Vercel

```env
NEXT_PUBLIC_SEPOLIA_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com
NEXT_PUBLIC_PREDICTION_MARKET_V3_ADDRESS=0x2565bc638ab1bFb26d86e63752bA1a3D7ee4fA28
NEXT_PUBLIC_ORACLE_BASE_URL=https://schizomycetous-monnie-ungraved.ngrok-free.dev
NEXT_PUBLIC_WC_PROJECT_ID=0f9aa790358ed08bade5daf5518257f3
```

## 3) Recomendado adicional (server-side en Vercel)

`/frontend/src/app/api/quote/route.ts` usa primero `ORACLE_BASE_URL` y luego `NEXT_PUBLIC_ORACLE_BASE_URL`.
Para evitar inconsistencias, define también:

```env
ORACLE_BASE_URL=<TU_URL_PUBLICA_DEL_ORACLE>
```

## 4) Guía para completar las variables pendientes

### `NEXT_PUBLIC_ORACLE_BASE_URL`

- No usar `http://127.0.0.1:3001` en producción.
- Debe ser un endpoint público HTTPS de tu oracle, por ejemplo:
  - `https://tu-oracle.onrender.com`
  - `https://tu-oracle.tu-dominio.com`
- Validación rápida:

```bash
curl -s https://TU_ORACLE_PUBLICO/health
```

Debe responder JSON con `ok: true` (o equivalente de health).

### `NEXT_PUBLIC_WC_PROJECT_ID`

- Crear/usar proyecto en WalletConnect Cloud.
- Copiar el `Project ID` y ponerlo en Vercel como:
  - `NEXT_PUBLIC_WC_PROJECT_ID=<ID>`

## 5) Variables locales actuales (referencia)

- Local dev actual de oracle: `ORACLE_BASE_URL=http://127.0.0.1:3001`
- Local dev frontend oracle: `NEXT_PUBLIC_ORACLE_BASE_URL=http://127.0.0.1:3001`

Estas dos son válidas solo para entorno local.
