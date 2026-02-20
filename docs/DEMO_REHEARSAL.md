# Demo Rehearsal + Recording Runbook

Usa este documento para que cada grabación salga igual.

## 1) Checklist pre-grabación (2 minutos)

### 0:00 - 0:30 | Variables y red Sepolia pública (modo recomendado)

```bash
export CRE_TARGET=staging-sepolia-public
export ETH_CHAIN_ID=11155111
export SEPOLIA_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com
export ORACLE_BASE_URL=http://127.0.0.1:3001
export PRIVATE_PAYOUT_RELAY_TOKEN_VAR=local-dev-private-relay-token
export NEXT_PUBLIC_RPC_MODE=fallback
export NEXT_PUBLIC_TRACE_WINDOW_BLOCKS=10000
export NEXT_PUBLIC_TX_WARN_AFTER_MS=25000
export NEXT_PUBLIC_TX_CONFIRM_TIMEOUT_MS=90000
export NEXT_PUBLIC_WORLD_ID_ENABLED=0
export NEXT_PUBLIC_WORLD_ID_APP_ID=app_staging_xxx
export NEXT_PUBLIC_WORLD_ID_ACTION_CREATE=fairlease-create-policy-v1
export NEXT_PUBLIC_WORLD_ID_ACTION_CLAIM=fairlease-claim-flight-v1
export NEXT_PUBLIC_WORLD_ID_CREATE_MIN_LEVEL=device
export NEXT_PUBLIC_WORLD_ID_CLAIM_MIN_LEVEL=orb
export WORLD_ID_VERIFY_ENDPOINT=https://developer.worldcoin.org/api/v2/verify
export WORLD_ID_DEV_BYPASS=0
```

Nota: `PRIVATE_PAYOUT_RELAY_TOKEN_VAR` se exporta para evitar fallo de resolución de secretos en CRE, incluso si corres `staging-sepolia-public`.

Pantalla exacta a mostrar:
- MetaMask en Sepolia con RPC público (PublicNode)
- En `/create`: panel `Validación de writes en Sepolia`
- Texto visible: `Chain ID esperado: 11155111`
- En `/create`: selector `Tipo de póliza` (`Inmueble` / `Viaje`) + panel `Paquete de pólizas`
- En `/create`: bloque `Proof of Humanity (World ID)` visible (opcional para este ensayo)
- Estado transaccional esperado al firmar: `Tx enviada. Verificando visibilidad en Sepolia...`

### 0:30 - 1:00 | Oracle y frontend vivos

```bash
curl -fsS http://127.0.0.1:3001/health
curl -fsS http://127.0.0.1:3000 > /dev/null && echo "frontend ok"
```

Pantalla exacta a mostrar:
- Terminal Oracle con `Status: LIVE`
- Terminal frontend con `Ready`

### 1:00 - 2:00 | Rehearsal técnico rápido

```bash
./scripts/rehearse-demo.sh --market-id 36
```

Resultado esperado:
- salida con `Settled: 0x...`
- línea final `[PASS] Settlement rehearsal successful. TX: 0x...`

Pantalla exacta a mostrar:
- Etherscan (Sepolia) con la transacción `report` en `Success`

## 2) Test guiado 3 transacciones (create/predict/claim)

Objetivo: grabar un flujo repetible de wallet tx en este orden:
1. `createMarket` (crear póliza)
2. `predict` (tomar posición / aportar)
3. `claim` (reclamar resultado ganador)

Recomendado para demo rápida (flight-first):
- usar `AV8520` para caso `YES`
- usar `LA4112` para caso `NO`

### TX #1 - Create

1. Ir a `http://localhost:3000/create`.
2. Seleccionar `Tipo de póliza: Viaje`.
3. Click en `Cargar demo Viaje (YES + NO)` para precargar paquete estándar.
4. Dejar 1 solo ítem (`AV8520`) para la toma principal (elimina el segundo si quieres simplificar).
5. (Opcional) En bloque World ID, click en `Verificar humanidad para crear`.
6. Click en `Crear paquete ahora`.
7. Firmar en MetaMask.
8. Verificar estado por ítem (`confirmed/failed`) y `Market ID`.

Pantallas exactas:
- página con título `Crear póliza`
- panel visible: `Paquete de pólizas`
- etiqueta de ítem: `✈️ Viaje` + estado
- links por ítem: `Etherscan ↗` (`Tenderly ↗` opcional)

### TX #2 - Predict (aporte al pool)

1. Abrir la póliza recién creada (`Ver pólizas`).
2. En bloque `Tomar posición (demo de mercado)` elegir:
   - `SÍ (retraso/cancelación / payout)`
   - Cantidad: `0.009` ETH
3. Click en `Enviar aporte`.
4. Firmar en MetaMask.
5. Esperar estado `Tx visible en Sepolia. Esperando confirmación...` o `Tx confirmada en Sepolia.`

Pantallas exactas:
- sección `Pool del mercado (demo)`
- confirmación: `¡Transacción confirmada!`
- hash visible en bloque `TX Hash (para CRE)`

### Liquidación intermedia (sin wallet tx, necesaria para claim)

1. Click en `Solicitar liquidación de IA` (para mostrar el flujo).
2. Copiar el comando desde `📋 Copiar comando CRE`.
3. Ejecutarlo en terminal desde la raíz del repo:

```bash
ORACLE_BASE_URL=http://127.0.0.1:3001 cre workflow simulate market-workflow --target staging-sepolia-public --broadcast --trigger-index 0 --http-payload '{"action":"settle","marketId":<ID_RECIEN_CREADO>}' --non-interactive
```

Resultado esperado:
- `Settled: 0x...`
- en la UI: estado `✓ Resuelta` y sección `Resultado` con `Veredicto`

### TX #3 - Claim

1. En `Resultado`, (opcional) completar `PNR`.
2. Si World ID está activo: `Verificar humanidad para reclamar (Orb)`.
3. Click en `Reclamar`.
4. Firmar en MetaMask.
5. Esperar estado `Tx confirmada en Sepolia.`

Pantallas exactas:
- sección `Resultado`
- bloque World ID en resultado (claim-flight)
- botón `Reclamar`
- Etherscan mostrando tx `claim` en `Success`

## 2B) Versión alterna NO-claim (espejo para segunda toma)

Objetivo: grabar la ruta donde no hubo incumplimiento y gana la posición `NO`.

Recomendado:
- usar `LA4112` (caso NO/sin retraso relevante)

### TX #1 - Create (NO-claim)

1. Ir a `http://localhost:3000/create`.
2. Seleccionar `Tipo de póliza: Viaje`.
3. Click en `Cargar demo Viaje (YES + NO)` para precargar `AV8520` y `LA4112`.
4. (Opcional) Configurar manual:
   - `Flight Code`: `LA4112`
   - `Fecha`: `2026-02-13`
   - `Threshold`: `45`
5. Si editaste, click en `Usar pregunta sugerida (vuelo)`.
6. Click en `Agregar al paquete` y luego `Crear paquete ahora`.
7. Firmar en MetaMask.
8. Confirmar `Market ID` y estado `confirmed` en panel de paquete.

Pantallas exactas:
- etiqueta de ítem: `✈️ Viaje`
- cobertura: `Retraso/cancelación de vuelo`
- estado por ítem en paquete + `TX Hash`

### TX #2 - Predict (posición NO)

1. Abrir la póliza recién creada.
2. En `Tomar posición (demo de mercado)` elegir:
   - `NO (sin retraso relevante)`
   - Cantidad: `0.009` ETH
3. Click en `Enviar aporte`.
4. Firmar en MetaMask.
5. Esperar estado `Tx visible en Sepolia. Esperando confirmación...` o `Tx confirmada en Sepolia.`

Pantallas exactas:
- confirmación: `¡Transacción confirmada!`
- hash visible en `TX Hash (para CRE)`

### Liquidación intermedia (sin wallet tx, necesaria para claim)

1. Click en `Solicitar liquidación de IA`.
2. Copiar y ejecutar el comando CRE:

```bash
ORACLE_BASE_URL=http://127.0.0.1:3001 cre workflow simulate market-workflow --target staging-sepolia-public --broadcast --trigger-index 0 --http-payload '{"action":"settle","marketId":<ID_RECIEN_CREADO>}' --non-interactive
```

Resultado esperado:
- `Settled: 0x...`
- en la UI: `✓ Resuelta`
- `Resultado` con `Veredicto: NO (sin retraso relevante)`

### TX #3 - Claim (NO-claim)

1. Click en `Reclamar`.
2. Firmar en MetaMask.
3. Esperar estado `Tx confirmada en Sepolia.`

Pantallas exactas:
- sección `Resultado` con `NO (sin retraso relevante)`
- tx `claim` en `Success` en Etherscan

## 3) Comando único de salud técnica (opcional antes de grabar)

```bash
./scripts/rehearse-demo.sh \
  --market-id 36 \
  --oracle-base-url http://127.0.0.1:3001 \
  --target staging-sepolia-public \
  --frontend-url http://127.0.0.1:3000
```

Valida:
- envs críticos (`CRE_ETH_PRIVATE_KEY`, `GEMINI_API_KEY_VAR`)
- `/health` de oracle
- reachability frontend
- settlement CRE con hash

## 3B) Sprint 2 — Oracle y datos en vivo

### Modos del oracle (Sprint 2)

El oracle ahora soporta tres modos configurables via `ORACLE_MODE`:

| Modo | Descripción |
| --- | --- |
| `demo` | Fixtures estáticos (sin red) — siempre estable |
| `live` | Llama al provider real; error si no responde |
| `hybrid` | Intenta live; cae a demo con `fallbackReason` en la respuesta |

```bash
# Demo (default)
node scripts/server-flight-oracle.js

# Hybrid con AviationStack
ORACLE_MODE=hybrid FLIGHT_PROVIDER=aviationstack AVIATIONSTACK_API_KEY=xxx \
  node scripts/server-flight-oracle.js

# Live con FlightAware (falla si no hay API key)
ORACLE_MODE=live FLIGHT_PROVIDER=flightaware FLIGHTAWARE_API_KEY=xxx \
  node scripts/server-flight-oracle.js
```

Variables de tuning:

```bash
FLIGHT_LIVE_TIMEOUT_MS=8000      # Timeout por request al provider (ms)
FLIGHT_LIVE_CACHE_TTL_SEC=300    # TTL del cache en memoria (segundos)
```

Verificar modo activo:

```bash
curl -s http://127.0.0.1:3101/health | jq '.provider, .mode, .cacheTtlSec'
```

### Ingest histórico (Sprint 2)

```bash
# 1. Iniciar oracle
node scripts/server-flight-oracle.js &

# 2. Ingestar observaciones (7 días, 5 vuelos = 35 obs)
INGEST_START_DATE=2025-01-01 INGEST_END_DATE=2025-01-07 \
  node scripts/flight-live-ingest.js

# 3. Generar reporte de riesgo/pricing
node scripts/route-risk-report.js

# 4. Ver artefactos
ls artifacts/
# flight-observations.csv
# flight-observations.json
# flight-risk-routes.csv
# flight-risk-summary.md
```

### Catálogo de aeropuertos

```bash
# Generar artifacts/slot-airports.csv desde seed
node scripts/slot-airports-sync.js

# Con override CSV externo
AIRPORTS_CSV=mi-override.csv node scripts/slot-airports-sync.js
```

### Risk report en 1 comando

```bash
node scripts/route-risk-report.js
# Lee artifacts/flight-observations.csv o artifacts/flight-risk-observations.csv
# Escribe artifacts/flight-risk-routes.csv + artifacts/flight-risk-summary.md
```

Parámetros ajustables:

```bash
TICKET_PRICE=125 BPS_TIER1=5000 BPS_TIER2=10000 MARGIN_PCT=20 \
  node scripts/route-risk-report.js
```

## 4) Troubleshooting rápido

- `[FAIL] Missing required env var`: exportar variable faltante y reintentar.
- `Oracle healthcheck failed`: iniciar `docs/integration/server-oracle.js`.
- `Frontend is not reachable`: correr `cd frontend && pnpm dev`.
- `Too early to settle`: esperar ventana mínima (`minMarketAgeMinutes`).
- `rpc_mismatch` en UI: la tx fue firmada en un RPC distinto al usado por frontend. Alinea MetaMask con el RPC esperado y presiona `Reintentar verificación`.
- `timeout` en UI: esperar confirmación en Etherscan (o explorer activo) y luego usar `Reintentar verificación`.
- `wallet rejected gas estimation` en create/predict:
  - verificar saldo de la cuenta activa en MetaMask (`>= 0.001 ETH` recomendado)
  - comando rápido: `cast balance <TU_WALLET> --rpc-url https://ethereum-sepolia-rpc.publicnode.com`
- `403 quota limit` en CRE: cambiar a `--target staging-sepolia-public`.

## 5) Nota Tenderly + CRE CLI

En `cre` v1.0.8, `workflow simulate` no usa `--rpc-url`; toma el RPC desde `project.yaml` según `--target`.

## 6) Seguridad de grabación

- No grabar con `-v` ni `--engine-logs`.
- No mostrar `.env`, private keys ni tokens.
