#+ Convergencia Hackathon — CRE AI Prediction Market (Medellín QoL)

> **1-line summary**: Mercados de predicción que liquidan automáticamente calidad de vida usando IA + CRE con datos urbanos verificables.

Tracks objetivo:
- **Prediction Markets**
- **CRE & AI**
- **Risk & Compliance** (seguridad/ruido como señales de riesgo)

---

## Problema
Medellín está viviendo fenómenos de gentrificación y cambios bruscos de calidad de vida en zonas residenciales. Los contratos de arriendo y operación necesitan señales verificables (ruido, seguridad, obras) para activar descuentos o cláusulas automáticamente.

## Solución
Un mercado de predicción que **liquida con IA** y **datos urbanos reales** (oracle IoT simulado). Chainlink CRE coordina la lectura on-chain, llamada a IA (Gemini), consenso y escritura en cadena, eliminando oráculos centralizados.

---

## Arquitectura (resumen)

```
[Frontend]  -> requestSettlement() -> [Contrato EVM]
                                      |
                                      v
                              [CRE Log Trigger]
                                      |
                       +--------------+--------------+
                       |                             |
                 [EVM Read]                     [Gemini AI]
                       |                             |
                       +--------------+--------------+
                                      v
                                 [Consensus]
                                      |
                                      v
                                [EVM Write]
                                      |
                                      v
                                  [Settled]

Oracle local (datos urbanos): /api/market/:id
```

---

## Repositorios
- **Repo principal (este)**: https://github.com/zswamtech/cre-prediction-market
- **Oracle urbano (datos Medellín)**: https://github.com/zswamtech/alojamientos-medellin

---

## Demo local (modo hackathon)

### 1) Oráculo local (datos urbanos)
```bash
cd /Users/andressoto/alojamientos-medellin
ALLOW_ORIGIN=http://localhost:3000 PORT=3001 node backend/scripts/server-oracle.js
```

### 2) Frontend (modo demo)
```bash
cd /Users/andressoto/prediction-market/cre-prediction-market/frontend
NEXT_PUBLIC_TEST_MODE=1 npm run build
NEXT_PUBLIC_TEST_MODE=1 npm run start -- -p 3000
```

### 3) Mercado de demo
Abrir en el navegador:
```
http://localhost:3000/market/28
```

> En modo `NEXT_PUBLIC_TEST_MODE=1` se muestra el botón de IA sin wallet para el demo.

---

## Simulación CRE (requisito principal)

### Requisitos
- CRE CLI instalado
- Gemini API key con billing

### Variables (root del repo)
```env
CRE_ETH_PRIVATE_KEY=...          # sin 0x
CRE_TARGET=staging-settings
GEMINI_API_KEY_VAR=...
# Opcional: oracle en cloud (Render) o local
ORACLE_BASE_URL=http://127.0.0.1:3001
```

### Ejecutar
```bash
cd /Users/andressoto/prediction-market/cre-prediction-market
cre workflow simulate market-workflow --broadcast
```
Selecciona:
- Trigger `2` (Log Trigger)
- TX Hash que emitió `SettlementRequested`

---

## Test E2E (opcional, pero listo)

```bash
cd /Users/andressoto/prediction-market/cre-prediction-market/frontend
TEST_MARKET_ID=28 npm run test:e2e
```

---

## Uso de Chainlink (links requeridos por hackathon)
- `market-workflow/main.ts` — triggers CRE
- `market-workflow/logCallback.ts` — lectura EVM + settlement
- `market-workflow/gemini.ts` — llamada Gemini AI + datos del oracle
- `market-workflow/workflow.yaml` — workflow CRE
- `project.yaml` — config CRE
- `secrets.yaml` — mapeo de secrets
- `contracts/src/PredictionMarket.sol` — contrato principal

---

## Video demo (3–5 min)
**Link**: _(pendiente)_

Guion sugerido:
1. Problema (gentrificación + calidad de vida)
2. Oráculo local con datos urbanos
3. Mercado #28 en frontend
4. Solicitar liquidación IA → TX Hash
5. Simulación CRE CLI

---

## Seguridad
- No subir `.env` ni llaves privadas.
- Usar `.env.example` para plantillas.

---

## Contacto
Equipo: Individual (Andrés Soto)
```

### 3. Settlement Request

Anyone can request settlement by calling:

```solidity
function requestSettlement(uint256 marketId) external
```

This emits a `SettlementRequested` event that triggers the CRE workflow.

### 4. AI-Powered Settlement (CRE Workflow)

The workflow:
1. **Detects** the `SettlementRequested` event (Log Trigger)
2. **Reads** market details from the contract (EVM Read)
3. **Queries** Gemini AI for the outcome (HTTP)
4. **Verifies** consensus across CRE nodes
5. **Writes** the settlement back to the contract (EVM Write)

### 5. Claiming Winnings

Winners call `claim(marketId)` to receive their proportional share of the pool.

---

## 🔐 Security Features

| Feature | Description |
|---------|-------------|
| **Decentralized Consensus** | Multiple CRE nodes must agree on AI response |
| **BFT Tolerance** | System works even if 1/3 of nodes are malicious |
| **On-Chain Verification** | All settlements are verifiable on Ethereum |
| **Keystone Forwarder** | Only authorized CRE reports can settle markets |

---

## 📊 CRE Capabilities Used

| Capability | Purpose |
|------------|---------|
| **Log Trigger** | Detect `SettlementRequested` events on-chain |
| **EVM Read** | Read market data from smart contract |
| **HTTP Client** | Query Gemini AI for outcome determination |
| **Consensus** | Ensure all nodes agree on AI response |
| **EVM Write** | Write verified settlement to blockchain |

---

## 🏆 Hackathon Submission

This project is submitted for **Convergence: A Chainlink Hackathon**

### Tracks

| Track | Prize | Fit |
|-------|-------|-----|
| **CRE & AI** | $20,000 | AI-powered oracle using Gemini |
| **Prediction Markets** | $20,000 | Decentralized market settlement |

### Requirements Met

- ✅ CRE workflow as orchestration layer
- ✅ Integrates blockchain with external AI (Gemini)
- ✅ Successful simulation demonstrated
- ✅ Public source code with documentation

---

## 👤 Author

**Andrés Soto**

- 🌐 Location: Medellín, Colombia
- 💼 GitHub: [@zswamtech](https://github.com/zswamtech)

---

## 📜 License

This project is licensed under the MIT License.

---

## 🔗 Resources

- [CRE Documentation](https://docs.chain.link/cre)
- [CRE Bootcamp GitBook](https://chainlink.gitbook.io/cre-bootcamp)
- [Convergence Hackathon](https://hack.chain.link)
- [Simulating Workflows](https://docs.chain.link/cre/guides/operations/simulating-workflows)
- [Gemini API Documentation](https://ai.google.dev/gemini-api/docs)
