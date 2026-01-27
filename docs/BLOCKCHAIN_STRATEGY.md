# Estrategia Blockchain - Proyectos Andres Soto

## Vision General

Crear un ecosistema de contratos inteligentes reutilizables entre proyectos.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     ECOSISTEMA BLOCKCHAIN ANDRES SOTO                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│                        ┌─────────────────────┐                              │
│                        │   CONTRATOS BASE    │                              │
│                        │   (Reutilizables)   │                              │
│                        └─────────┬───────────┘                              │
│                                  │                                          │
│         ┌────────────────────────┼────────────────────────┐                 │
│         │                        │                        │                 │
│         ▼                        ▼                        ▼                 │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐             │
│  │  ALOJAMIENTOS   │  │  PREDICTION     │  │    BIGLOI       │             │
│  │    MEDELLIN     │  │    MARKET       │  │   (Futuro)      │             │
│  ├─────────────────┤  ├─────────────────┤  ├─────────────────┤             │
│  │ BookingEscrow   │  │ PredictionMarket│  │ AIVerification  │             │
│  │ ContractorPay   │  │ (del bootcamp)  │  │ DataMarketplace │             │
│  │ PropertyToken   │  │                 │  │                 │             │
│  │ RevenueShare    │  │                 │  │                 │             │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘             │
│         │                        │                        │                 │
│         └────────────────────────┼────────────────────────┘                 │
│                                  │                                          │
│                        ┌─────────▼───────────┐                              │
│                        │    CHAINLINK CRE    │                              │
│                        │   (Oraculos + AI)   │                              │
│                        └─────────────────────┘                              │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Fase 1: Bootcamp (prediction-market)

**Objetivo**: Aprender los fundamentos de CRE

**Entregables**:
- [x] Contrato PredictionMarket.sol compilado
- [x] Workflow CRE configurado
- [ ] Deploy en Sepolia
- [ ] HTTP Trigger funcionando
- [ ] Log Trigger + AI Settlement

**Aplicacion futura**: El patron de PredictionMarket se puede adaptar para:
- Prediccion de ocupacion en alojamientos
- Prediccion de precios de mercado
- Cualquier pregunta Yes/No verificable

---

## Fase 2: Alojamientos Medellin (Valor Real)

### Contratos a Implementar

#### 1. BookingEscrow.sol
**Ya creado en**: `alojamientos-medellin/blockchain/contracts/src/`

```solidity
// Flujo principal
createBooking() → confirmBooking() → checkIn() → completeBooking()
                                                        │
                                          ┌─────────────┴─────────────┐
                                          │                           │
                                     80% Propietario            20% Plataforma
```

**Integracion CRE**:
- Log Trigger: Detectar cuando se crea reserva en PostgreSQL
- HTTP Fetch: Verificar disponibilidad en tiempo real
- EVM Write: Crear deposito automaticamente

#### 2. ContractorPayment.sol
**Ya creado en**: `alojamientos-medellin/blockchain/contracts/src/`

```solidity
// Flujo principal
createJob() → startJob() → submitCompletion() → approveAndPay()
                                    │
                              ┌─────┴─────┐
                              │ IPFS hash │
                              │ (fotos)   │
                              └───────────┘
```

**Integracion CRE**:
- Log Trigger: Detectar JobCompletedByContractor
- HTTP Fetch: Verificar fotos en IPFS
- AI (Gemini): Validar que el trabajo esta completo
- EVM Write: Aprobar y pagar automaticamente

#### 3. OccupancyMarket.sol (Adaptado del bootcamp)

```solidity
// Adaptar PredictionMarket para ocupacion
createMarket("¿Ocupacion > 80% en Diciembre 2026?")
predict(marketId, Yes, 0.1 ETH)
requestSettlement(marketId)
// CRE consulta datos reales de ocupacion
// AI determina el resultado
claim(marketId)
```

**Integracion CRE**:
- HTTP Fetch: Consultar API de ocupacion real
- AI: Comparar prediccion con datos reales
- EVM Write: Liquidar mercado

#### 4. PropertyToken.sol (Futuro)

```solidity
// Tokenizacion de propiedades
mint(propertyId, totalShares) → ERC-721 o ERC-1155
invest(propertyId, amount) → Comprar participacion
distributeRevenue(propertyId) → Repartir ingresos
```

---

## Fase 3: BigLoI (Evaluacion)

**Preguntas para evaluar**:
1. ¿Que datos genera BigLoI que podrian beneficiarse de verificacion descentralizada?
2. ¿Hay pagos o transacciones que requieran confianza?
3. ¿Hay predicciones o analisis que podrian ser mercados?

**Posibles casos de uso**:
- Verificacion de analisis AI on-chain
- Marketplace de datos verificados
- Pagos por uso de modelos AI

---

## Arquitectura Tecnica Comun

### Estructura de Carpetas (Estandar para todos los proyectos)

```
proyecto/
├── blockchain/
│   ├── contracts/
│   │   ├── src/
│   │   │   ├── [Contrato].sol
│   │   │   └── interfaces/
│   │   │       ├── IReceiver.sol
│   │   │       └── ReceiverTemplate.sol
│   │   ├── test/
│   │   ├── script/
│   │   └── foundry.toml
│   ├── workflows/           # CRE workflows
│   │   ├── [workflow-name]/
│   │   │   ├── main.ts
│   │   │   ├── workflow.yaml
│   │   │   └── config.staging.json
│   │   ├── project.yaml
│   │   └── secrets.yaml
│   └── docs/
│       ├── ARCHITECTURE.md
│       └── INTEGRATION.md
└── [resto del proyecto]
```

### Patron de Integracion Backend ↔ Blockchain

```javascript
// services/blockchain.service.js (reutilizable)
class BlockchainService {
  constructor(config) {
    this.provider = new ethers.JsonRpcProvider(config.rpcUrl);
    this.wallet = new ethers.Wallet(config.privateKey, this.provider);
  }

  // Metodo generico para cualquier contrato
  async callContract(contractAddress, abi, method, args, options = {}) {
    const contract = new ethers.Contract(contractAddress, abi, this.wallet);
    const tx = await contract[method](...args, options);
    return tx.wait();
  }

  // Escuchar eventos de cualquier contrato
  async listenToEvents(contractAddress, abi, eventName, callback) {
    const contract = new ethers.Contract(contractAddress, abi, this.provider);
    contract.on(eventName, callback);
  }
}
```

---

## Cronograma Sugerido

### Semana 1 (Actual)
- [x] Preparar prediction-market
- [ ] Completar Bootcamp CRE (Dia 1 y 2)
- [ ] Deploy PredictionMarket en Sepolia

### Semana 2
- [ ] Adaptar conocimiento a alojamientos-medellin
- [ ] Deploy BookingEscrow en Sepolia
- [ ] Crear workflow CRE para verificacion de check-in

### Semana 3
- [ ] Deploy ContractorPayment
- [ ] Integrar con admin panel
- [ ] Testing end-to-end

### Semana 4
- [ ] OccupancyMarket (prediccion de ocupacion)
- [ ] Documentacion completa
- [ ] Demo para stakeholders

### Mes 2+
- [ ] Tokenizacion de propiedades
- [ ] Evaluar BigLoI
- [ ] Produccion en Polygon

---

## Costos Estimados (Sepolia = Gratis, Mainnet = Real)

| Operacion | Gas Estimado | Costo Polygon (~$0.01/gwei) |
|-----------|--------------|------------------------------|
| Deploy BookingEscrow | ~2M gas | ~$0.50 |
| createBooking | ~200k gas | ~$0.05 |
| completeBooking | ~100k gas | ~$0.02 |
| Deploy PredictionMarket | ~3M gas | ~$0.75 |
| createMarket | ~150k gas | ~$0.04 |

**Recomendacion**: Usar Polygon para produccion (mas barato que Ethereum)

---

## Recursos

- [Chainlink CRE Docs](https://docs.chain.link/cre)
- [OpenZeppelin Contracts](https://docs.openzeppelin.com/contracts)
- [Foundry Book](https://book.getfoundry.sh/)
- [Polygon Docs](https://docs.polygon.technology/)

---

> "La estrategia es: Aprender con el bootcamp, Aplicar en alojamientos, Escalar a todos los proyectos"
