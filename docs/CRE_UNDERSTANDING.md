# Entendiendo CRE - Chainlink Runtime Environment

## La Analogia: CRE es como un "Servidor Distribuido Confiable"

Imagina que tienes un servidor tradicional (Node.js) que:
- Recibe solicitudes HTTP
- Procesa datos
- Escribe en una base de datos

**El problema**: Si tu servidor falla o es hackeado, todo se pierde.

**CRE resuelve esto**: En lugar de UN servidor, tienes MUCHOS nodos independientes que:
- Ejecutan el mismo codigo
- Verifican los resultados entre ellos (consenso)
- Solo aceptan el resultado si la mayoria esta de acuerdo

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    SERVIDOR TRADICIONAL vs CRE                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   TRADICIONAL                         CRE (Chainlink)                       │
│   ───────────                         ───────────────                       │
│                                                                             │
│   [Tu Servidor]                       [Nodo 1] [Nodo 2] [Nodo 3]...        │
│        │                                   │       │       │                │
│        │ (Un punto de falla)               └───────┼───────┘                │
│        │                                           │                        │
│        ▼                                    [Consenso BFT]                  │
│   [Resultado]                                      │                        │
│   (Puede ser                                       ▼                        │
│    manipulado)                              [Resultado Verificado]          │
│                                             (Imposible de manipular)        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Los Componentes Clave

### 1. Workflow (Flujo de Trabajo)

Es tu codigo compilado a WebAssembly (WASM). Piensa en el como una "funcion serverless" pero descentralizada.

```typescript
// Tu codigo TypeScript
const miWorkflow = () => {
  // Tu logica aqui
};

// Se compila a WASM y se ejecuta en multiples nodos
```

**En tu proyecto**: El workflow de prediction-market que creara mercados y los liquidara con AI.

---

### 2. Trigger (Disparador)

Es el EVENTO que inicia tu workflow. Responde a: **"¿CUANDO se ejecuta mi codigo?"**

| Trigger | Descripcion | Uso en tu proyecto |
|---------|-------------|-------------------|
| **Cron** | Cada X tiempo | "Cada hora, verificar ocupacion" |
| **HTTP** | Solicitud externa | "Cuando alguien crea un mercado" |
| **Log (EVM)** | Evento on-chain | "Cuando se emite SettlementRequested" |

```typescript
// Cron Trigger - se ejecuta cada 10 minutos
cron.trigger({ schedule: "0 */10 * * * *" })

// HTTP Trigger - se ejecuta cuando recibe una solicitud
http.trigger({ method: "POST", path: "/create-market" })

// Log Trigger - se ejecuta cuando detecta un evento en blockchain
log.trigger({
  contractAddress: "0x...",
  eventSignature: "SettlementRequested(uint256,string)"
})
```

---

### 3. Callback (Devolución de Llamada)

Es la FUNCION que contiene tu logica. Responde a: **"¿QUE hace mi codigo?"**

```typescript
// El callback recibe un objeto "runtime" con herramientas
const onHttpRequest = (runtime: Runtime<Config>): Result => {
  // 1. Leer datos de la solicitud
  const question = runtime.request.body.question;

  // 2. Usar capacidades (llamar APIs, leer blockchain, etc.)
  const result = runtime.capabilities.evmWrite(...);

  // 3. Retornar resultado
  return { marketId: result.id };
};
```

---

### 4. Handler (Manejador)

Es el PEGAMENTO que conecta un Trigger con un Callback.

```typescript
// Sintaxis: cre.handler(trigger, callback)
cre.handler(
  http.trigger({ method: "POST" }),  // CUANDO: reciba un POST
  onCreateMarket                      // QUE: ejecutar esta funcion
)
```

**Puedes tener multiples handlers en un workflow:**

```typescript
return [
  // Handler 1: Crear mercados via HTTP
  cre.handler(http.trigger(...), onCreateMarket),

  // Handler 2: Liquidar mercados cuando detecte evento
  cre.handler(log.trigger(...), onSettlement),

  // Handler 3: Verificar mercados cada hora
  cre.handler(cron.trigger(...), onHealthCheck),
];
```

---

### 5. Capabilities (Capacidades)

Son los "superpoderes" que CRE te da. Cada uno es un servicio descentralizado.

| Capacidad | Descripcion | Ejemplo |
|-----------|-------------|---------|
| **EVM Write** | Escribir en blockchain | Crear mercado en contrato |
| **EVM Read** | Leer de blockchain | Obtener estado del mercado |
| **HTTP Fetch** | Llamar APIs externas | Consultar precio de crypto |
| **Confidential HTTP** | Llamar APIs con secretos | Consultar Gemini AI |

```typescript
// Dentro de tu callback, usas capacidades asi:
const onCreateMarket = async (runtime: Runtime<Config>) => {
  // Capacidad: EVM Write
  const evmWrite = new cre.capabilities.EvmWriteCapability();

  // Llamar al contrato
  const result = await evmWrite.write({
    contract: runtime.config.marketAddress,
    method: "createMarket",
    args: [question]
  });

  return result;
};
```

---

### 6. DON (Decentralized Oracle Network)

Es la RED de nodos que ejecuta tu codigo. Hay dos tipos:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              ARQUITECTURA DON                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                        WORKFLOW DON                                 │   │
│   │   - Escucha los triggers                                            │   │
│   │   - Coordina la ejecucion del workflow                              │   │
│   │   - Decide cuando llamar a Capability DONs                          │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│              ┌─────────────────────┼─────────────────────┐                  │
│              │                     │                     │                  │
│              ▼                     ▼                     ▼                  │
│   ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐         │
│   │  CAPABILITY DON  │  │  CAPABILITY DON  │  │  CAPABILITY DON  │         │
│   │   (EVM Write)    │  │   (HTTP Fetch)   │  │   (EVM Read)     │         │
│   │                  │  │                  │  │                  │         │
│   │  Escribe en      │  │  Llama APIs      │  │  Lee de          │         │
│   │  blockchain      │  │  externas        │  │  blockchain      │         │
│   └──────────────────┘  └──────────────────┘  └──────────────────┘         │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### 7. Consenso BFT (Byzantine Fault Tolerant)

Es el proceso que VERIFICA que todos los nodos esten de acuerdo.

**El problema de los generales bizantinos**:
- Tienes 10 generales que deben atacar juntos
- Algunos pueden ser traidores
- ¿Como te aseguras de que la decision sea correcta?

**Solucion BFT**:
- Si 2/3 de los nodos estan de acuerdo, el resultado es valido
- Aunque 1/3 sean maliciosos, no pueden manipular el resultado

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           CONSENSO EN ACCION                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   Pregunta: "¿Argentina gano el Mundial 2022?"                              │
│                                                                             │
│   Nodo 1: "Si" ─────┐                                                       │
│   Nodo 2: "Si" ─────┼──▶ [Consenso] ──▶ Resultado: "Si" (verificado)       │
│   Nodo 3: "Si" ─────┤                                                       │
│   Nodo 4: "No" ─────┘    (3/4 = 75% de acuerdo, suficiente)                │
│                                                                             │
│   Este resultado verificado se escribe en blockchain                        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## El Flujo Completo: Prediction Market

Veamos como todo funciona junto en tu proyecto:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    DIA 1: CREAR MERCADO                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   1. Usuario envia POST a CRE                                               │
│      { "question": "¿Bitcoin superara $100k en 2026?" }                     │
│                          │                                                  │
│                          ▼                                                  │
│   2. HTTP Trigger detecta la solicitud                                      │
│                          │                                                  │
│                          ▼                                                  │
│   3. Workflow DON ejecuta tu callback en multiples nodos                    │
│                          │                                                  │
│                          ▼                                                  │
│   4. Callback usa EVM Write capability                                      │
│      - Codifica la pregunta                                                 │
│      - Llama a PredictionMarket.createMarket()                              │
│                          │                                                  │
│                          ▼                                                  │
│   5. Capability DON (EVM Write) ejecuta la transaccion                      │
│      - Multiples nodos firman                                               │
│      - Consenso verifica                                                    │
│                          │                                                  │
│                          ▼                                                  │
│   6. Mercado creado on-chain                                                │
│      - Evento MarketCreated emitido                                         │
│      - marketId = 0                                                         │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                    DIA 2: LIQUIDAR MERCADO                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   1. Usuario llama requestSettlement(marketId) en el contrato               │
│      - Evento SettlementRequested emitido                                   │
│                          │                                                  │
│                          ▼                                                  │
│   2. Log Trigger detecta el evento on-chain                                 │
│                          │                                                  │
│                          ▼                                                  │
│   3. Workflow DON ejecuta tu callback de liquidacion                        │
│                          │                                                  │
│                          ▼                                                  │
│   4. Callback usa Confidential HTTP capability                              │
│      - Llama a Gemini AI con la pregunta del mercado                        │
│      - "¿Bitcoin supero $100k en 2026? Responde Yes o No"                   │
│                          │                                                  │
│                          ▼                                                  │
│   5. Gemini responde: { answer: "Yes", confidence: 95 }                     │
│      - Multiples nodos verifican la respuesta                               │
│      - Consenso: todos obtuvieron "Yes"                                     │
│                          │                                                  │
│                          ▼                                                  │
│   6. Callback usa EVM Write capability                                      │
│      - Codifica el resultado                                                │
│      - Llama a PredictionMarket.onReport()                                  │
│                          │                                                  │
│                          ▼                                                  │
│   7. Mercado liquidado on-chain                                             │
│      - Evento MarketSettled emitido                                         │
│      - Ganadores pueden reclamar premios                                    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Aplicacion a tu Proyecto de Alojamientos

```
┌─────────────────────────────────────────────────────────────────────────────┐
│              CRE + ALOJAMIENTOS MEDELLIN (Post-Bootcamp)                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   CASO 1: Prediccion de Ocupacion                                           │
│   ──────────────────────────────────                                        │
│   Trigger: Cron (cada mes)                                                  │
│   Capacidades: HTTP Fetch (datos historicos) + AI (Gemini) + EVM Write      │
│   Resultado: Mercado de prediccion "¿Ocupacion > 80% en Diciembre?"         │
│                                                                             │
│   CASO 2: Verificacion de Check-in                                          │
│   ───────────────────────────────────                                       │
│   Trigger: HTTP (IoT smart lock)                                            │
│   Capacidades: EVM Read (verificar reserva) + EVM Write (actualizar estado) │
│   Resultado: Deposito liberado automaticamente                              │
│                                                                             │
│   CASO 3: Pago a Contratistas                                               │
│   ────────────────────────────────                                          │
│   Trigger: Log (JobCompletedByContractor event)                             │
│   Capacidades: HTTP Fetch (verificar fotos IPFS) + AI + EVM Write           │
│   Resultado: Pago automatico si evidencia es valida                         │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Glosario Rapido

| Termino | Definicion Simple |
|---------|-------------------|
| **Workflow** | Tu codigo compilado a WASM |
| **Trigger** | El evento que inicia tu codigo |
| **Callback** | La funcion con tu logica |
| **Handler** | Conecta trigger + callback |
| **Capability** | Superpoder (escribir blockchain, llamar API) |
| **DON** | Red de nodos que ejecuta tu codigo |
| **Consenso** | Verificacion de que todos los nodos esten de acuerdo |
| **Runtime** | Objeto que te da acceso a capacidades |
| **WASM** | Formato binario portable (WebAssembly) |
| **BFT** | Byzantine Fault Tolerant (tolerante a nodos maliciosos) |

---

## Comandos Clave

```bash
# Simular tu workflow (ejecuta localmente pero llama APIs reales)
cre workflow simulate market-workflow

# Ver logs de simulacion
cre workflow simulate market-workflow --verbose

# Desplegar a produccion (requiere acceso)
cre workflow deploy market-workflow --target staging-settings
```

---

## El Poder de CRE

**Sin CRE**:
- Tu servidor llama a Gemini AI
- ¿Como pruebas que la respuesta no fue manipulada?
- ¿Que pasa si tu servidor miente?

**Con CRE**:
- 10+ nodos independientes llaman a Gemini AI
- Todos deben obtener la misma respuesta
- El resultado es criptograficamente verificable
- Nadie puede manipularlo

**Esto es revolucionario para**:
- Finanzas descentralizadas (DeFi)
- Mercados de prediccion
- Automatizacion de contratos
- Cualquier cosa que requiera "verdad verificable"

---

> "CRE convierte cualquier API, cualquier dato, en una fuente de verdad descentralizada"
