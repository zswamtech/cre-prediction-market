# Flight-Delay Focus Handoff (Nueva Fase)

Fecha de corte: 13 de febrero de 2026  
Objetivo: re-enfocar FairLease a una demo principal de **pólizas por retraso/cancelación de vuelo**, manteniendo **inmueble** como caso secundario (no se elimina).

---

## 1) Decisión de producto (cerrada)

### Enfoque principal (para video + pitch)
- Producto principal: **Experience Insurance - Flight Delay**.
- Condición binaria: `SÍ` si `delay >= threshold` o `status = CANCELLED`; `NO` en caso contrario.
- Valor para usuario: pago verificable y rápido con evento objetivo.

### Enfoque secundario (se mantiene)
- Caso `Inmueble` sigue disponible como evidencia de versatilidad multi-vertical.
- Se presenta como “otra vertical soportada”, no como narrativa principal.

---

## 2) Qué ya está construido (base actual)

### Frontend
- `/create` ya soporta tipos `Inmueble` y `Viaje`.
- Plantillas por tipo + paquete off-chain secuencial (`1 póliza = 1 tx`).
- Botones rápidos:
  - `Cargar demo Inmueble (YES + NO)`
  - `Cargar demo Viaje (YES + NO)`
- Estados por item (`draft`, `awaiting_signature`, `broadcasted`, `confirmed`, etc.).

### Oracle
- Endpoint de vuelo disponible:
  - `GET /api/flight-delay/:flightId`
  - `GET /api/flight-delay?flightId=...&date=...`
- Modos:
  - `FLIGHT_ORACLE_MODE=demo|live|hybrid`

### CRE
- Liquidación de pólizas de vuelo ya probada con fallback determinístico en 429.
- Flujo de settlement onchain funcional (`Settled: 0x...`).

### Simulador financiero
- Script individual: `scripts/simulate-portfolio.js`
- Script dual (inmueble + vuelo): `scripts/simulate-dual-portfolio.js`

---

## 3) Scope de esta fase (hasta envío final)

## P0 (obligatorio para entrega)
1. Narrativa y demo centradas en vuelo.
2. Flujo reproducible con 2 casos:
   - YES: `AV8520` (delay breach)
   - NO: `LA4112` (sin breach)
3. Slide financiera con:
   - expected net
   - break-even breach probability
   - reserva @99%
   - worst-case reserve
4. Runbook de grabación corto y determinístico.

## P1 (recomendado)
1. Dejar `Viaje` como default visual en `/create` para video.
2. Ajustar copy global de producto a “Experience Insurance”.
3. Mostrar badge “Principal: Viaje” y “Secundario: Inmueble”.

## P2 (post-video / evolución)
1. Extender a logística (delivery delays) y movilidad (ETA SLA).
2. Integrar fuente oficial live de vuelos (si API productiva queda estable).
3. Pricing dinámico por ruta/horario/aerolínea según histórico real.

---

## 4) No negociables técnicos

1. No redeploy de contratos para esta entrega.
2. Chain ID de demo: `11155111` (Sepolia-compatible).
3. Writes oficiales de demo: Sepolia pública (`staging-sepolia-public`).
4. Tenderly permanece opcional para observabilidad, no bloqueante.
5. Mantener fallback determinístico cuando Gemini responda 429.
6. Mantener trazabilidad de decisión (fuente + checks + razón).
7. No romper flujo actual de inmueble.

---

## 4B) Arquitectura de confianza (pitch-ready)

FairLease comunica ahora tres pilares:

1. **Data Truth**: oracle de vuelo + CRE (evento objetivo: delay/cancelación).
2. **Logic Truth**: decisión paramétrica + trazabilidad determinística.
3. **Identity Truth**: World ID (Proof of Humanity) para anti-Sybil.

Limitación explícita de esta fase:

- Sin contrato nuevo: enforcement de World ID se realiza en frontend + API (`/api/world-id/verify`).
- Create gate: `device`/`orb`.
- Claim gate (flight): `orb` obligatorio.

---

## 5) Flujo demo recomendado (simple y vendible)

1. Levantar oracle de vuelos (demo/hybrid).
2. Crear póliza de vuelo (`AV8520`, threshold 45).
3. Aportar al pool.
4. Ejecutar settlement CRE desde comando copiable.
5. Mostrar resultado onchain + claim.
6. Repetir con `LA4112` para caso NO-claim.

Resultado: prueba de ambas rutas (paga/no paga) con evidencia verificable.

---

## 6) Comandos operativos

## Oracle (vuelo)
```bash
FLIGHT_ORACLE_MODE=demo ALLOW_ORIGIN=http://localhost:3000 PORT=3001 \
node docs/integration/server-oracle.js
```

## Frontend
```bash
cd frontend
NEXT_PUBLIC_SEPOLIA_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com \
NEXT_PUBLIC_RPC_MODE=fallback \
NEXT_PUBLIC_TX_WARN_AFTER_MS=25000 \
NEXT_PUBLIC_TX_CONFIRM_TIMEOUT_MS=90000 \
NEXT_PUBLIC_WORLD_ID_ENABLED=0 \
NEXT_PUBLIC_WORLD_ID_APP_ID=app_staging_xxx \
NEXT_PUBLIC_WORLD_ID_ACTION_CREATE=fairlease-create-policy-v1 \
NEXT_PUBLIC_WORLD_ID_ACTION_CLAIM=fairlease-claim-flight-v1 \
NEXT_PUBLIC_WORLD_ID_CREATE_MIN_LEVEL=device \
NEXT_PUBLIC_WORLD_ID_CLAIM_MIN_LEVEL=orb \
NEXT_PUBLIC_ORACLE_BASE_URL=http://127.0.0.1:3001 \
pnpm dev
```

Para activar World ID en demo avanzada, cambia solo:
`NEXT_PUBLIC_WORLD_ID_ENABLED=1`.

## Settlement CRE (ejemplo)
```bash
PRIVATE_PAYOUT_RELAY_TOKEN_VAR=local-dev-private-relay-token \
ORACLE_BASE_URL=http://127.0.0.1:3001 \
cre workflow simulate market-workflow \
  --target staging-sepolia-public \
  --broadcast \
  --trigger-index 0 \
  --http-payload '{"action":"settle","marketId":<MARKET_ID>}' \
  --non-interactive
```

## Viabilidad financiera (1000 + 1000)
```bash
node scripts/simulate-dual-portfolio.js \
  --property-count 1000 \
  --flight-count 1000 \
  --property-breach-prob 0.25 \
  --flight-delay-rate 0.20 \
  --currency USD \
  --trials 30000 \
  --confidence 0.99 \
  --target-net-per-policy 5
```

---

## 7) Riesgos y mitigaciones

1. **RPC mismatch wallet vs red activa del frontend**
   - Síntoma: tx hash existe pero UI no la ve.
   - Mitigación: MetaMask Sepolia debe usar el mismo RPC del modo demo (por defecto Sepolia pública).

2. **Gemini 429**
   - Síntoma: rate limit.
   - Mitigación: fallback deterministic engine (no bloquea settlement).

3. **Etherscan no muestra tx**
   - Síntoma: tx sólo visible en Tenderly.
   - Causa: tx ejecutada en VNet/fork, no en Sepolia pública.

4. **Tiempo de confirmación UI**
   - Mitigación: botón `Reintentar verificación` + estados explícitos.

---

## 7B) Known issues y resolución

1. **`predict reverted` en frontend**
   - Causa típica: red/estado desalineado o wallet ya predijo (`AlreadyPredicted`).
   - Resolución:
     - Alinear MetaMask con RPC esperado de demo.
     - Validar que `getPrediction.amount == 0` antes de aportar.
     - Mostrar custom errors legibles (`MarketAlreadySettled`, `InvalidAmount`, `AlreadyPredicted`).

2. **`403 quota limit` en CRE**
   - Causa: cuota agotada del proveedor RPC del target actual (frecuente en Tenderly gratuito).
   - Resolución:
     - Ejecutar CRE con `--target staging-sepolia-public`.
     - Mantener Tenderly solo como observabilidad opcional.

---

## 8) Mensaje de negocio para pitch

Propuesta:
- “Compramos riesgo operativo objetivo (retrasos/cancelaciones) y vendemos tranquilidad al viajero.”
- “Si ocurre el evento verificable, el pago se liquida automáticamente y de forma auditable.”
- “El precio de la póliza se ajusta por probabilidad histórica real de breach.”

Ventaja:
- Evento simple de entender.
- Fácil de vender.
- Fácil de verificar.
- Fácil de escalar a otras verticales con SLA (logística, movilidad, eventos).

---

## 9) Próximo chat: prompt de arranque (copiar/pegar)

Usar este prompt al abrir chat nuevo:

```text
Continuamos FairLease en fase Flight-Delay Focus.
Lee primero `docs/FLIGHT_DELAY_FOCUS_HANDOFF.md` y toma ese archivo como fuente de verdad.

Objetivo inmediato:
1) Dejar narrativa y UX de demo centrada en vuelo (AV8520 YES y LA4112 NO).
2) Mantener inmueble como vertical secundaria sin romperla.
3) Preparar entregables de video y pitch (incluyendo simulación financiera y reserva inicial).

Reglas:
- No redeploy de contratos.
- Chain ID 11155111.
- Writes de demo en Sepolia pública (`staging-sepolia-public`).
- Mantener fallback determinístico en 429.
- Cambios pequeños y verificables, con `pnpm --dir frontend exec tsc --noEmit` al final.
```

---

## 10) Criterio de éxito de fase

1. Demo oficial se entiende en menos de 60 segundos.
2. Se muestran dos resultados (YES/NO) de vuelo sin ambigüedad.
3. El jurado entiende claramente:
   - quién paga,
   - cuándo paga,
   - por qué es verificable,
   - cómo se sostiene financieramente.
4. Inmueble queda como prueba de expansión, no como carga narrativa.
