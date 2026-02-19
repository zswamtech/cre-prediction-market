# Guion Oficial de Video (<= 5 minutos)

Objetivo: mostrar valor de negocio + demo técnica reproducible.

## 0:00 - 0:20 | Problema y propuesta
Texto sugerido:
"Hoy millones de viajeros pierden tiempo y dinero por retrasos de vuelo, y reclamar compensaciones es lento y manual. FairLease convierte eso en un seguro paramétrico: si hay retraso >= 45 minutos o cancelación, el payout se activa automáticamente con Chainlink CRE y evidencia verificable."

Pantalla:
- Slide 1 (Problema + solución en una frase)

## 0:20 - 0:45 | Arquitectura de confianza
Texto sugerido:
"Nuestro sistema une tres capas: Data Truth con oracle de vuelo, Logic Truth con CRE + IA + reglas determinísticas, y settlement onchain en Sepolia para que el resultado sea auditable y cobrable."

Pantalla:
- Diagrama simple: Frontend -> Contract -> CRE -> Oracle/Gemini -> writeReport

## 0:45 - 1:35 | Create (caso vuelo)
Texto sugerido:
"En el frontend creamos una póliza de vuelo con pregunta binaria verificable. Usamos dos casos: AV8520 para YES y LA4112 para NO. Cada póliza es 1 mercado y 1 transacción onchain."

Pantalla:
- `/create`
- Tipo de póliza: `Viaje`
- Plantilla: `Retraso o cancelación`
- Pregunta:
  - AV8520: `¿Se activó el payout por retraso...`
  - LA4112: `¿Se activó el payout por retraso...`
- Confirmación con `Market ID` y `TX Hash`

## 1:35 - 2:05 | Predict (aporte al pool)
Texto sugerido:
"Ahora financiamos el pool con una posición SÍ o NO. Esta transacción define quién puede reclamar según el resultado final."

Pantalla:
- `/market/<id>`
- `Pool SÍ / Pool NO`
- Botón `Enviar aporte`
- TX confirmada en Sepolia

## 2:05 - 3:05 | Settle con CRE (momento clave)
Texto sugerido:
"Liquidamos con Chainlink CRE. El workflow consulta el oracle del vuelo, consulta IA y, si hay rate limit 429, aplica fallback determinístico con reglas paramétricas. Luego escribe el veredicto onchain."

Pantalla:
- Terminal ejecutando:
```bash
ORACLE_BASE_URL=http://127.0.0.1:3001 \
cre workflow simulate market-workflow \
  --target staging-sepolia-public \
  --broadcast \
  --trigger-index 0 \
  --http-payload '{"action":"settle","marketId":<ID>}' \
  --non-interactive
```
- Mostrar en logs:
  - `Step 2 AI Result: YES/NO`
  - `Settlement successful: 0x...`

## 3:05 - 3:45 | Resultado + Claim
Texto sugerido:
"Con la póliza resuelta, el ganador reclama directamente en wallet. El proceso completo queda auditable con hash, resultado y trazabilidad de decisión."

Pantalla:
- `Resultado: YES/NO`
- `Reclamar`
- TX de claim en Etherscan

## 3:45 - 4:20 | Viabilidad financiera
Texto sugerido:
"No es solo una demo técnica: corrimos simulación de cartera para estimar margen esperado, break-even y reserva @99%. Así justificamos cuánto capital inicial se necesita para escalar sin comprometer pagos."

Pantalla:
- Tabla o slide con:
  - expected net
  - break-even breach
  - reserve @99%
  - worst-case reserve

## 4:20 - 4:50 | Diferenciadores y cierre
Texto sugerido:
"FairLease compra riesgo operativo verificable y vende tranquilidad inmediata. Empezamos con vuelos porque el evento es objetivo y fácil de auditar, y el mismo motor se extiende a otras verticales de experiencia como logística, movilidad y eventos."

Pantalla:
- Slide final:
  - "Flight-delay first"
  - "CRE settlement onchain"
  - "Parametric + auditable + scalable"

---

## Frases cortas para Q&A (jueces)
- "Nuestro fallback determinístico evita bloqueo por 429 y mantiene settlement reproducible."
- "La ruta principal de demo es Sepolia pública para evitar dependencia de cuotas de VNet."
- "Cada póliza tiene condición binaria auditable y evidencia de fuente."
- "No reemplazamos aseguradoras: automatizamos verificación y pago paramétrico."

## Checklist de grabación
- Usar `docs/DEMO_REHEARSAL.md` antes de grabar.
- No mostrar `.env` ni llaves privadas.
- No usar flags verbose (`-v`, `--engine-logs`).
