# 🧠 Contexto para Claude - CRE Prediction Market

> **Propósito:** Este archivo proporciona contexto completo para que Claude (o cualquier LLM) pueda continuar el desarrollo de este proyecto sin perder información crítica.

---

## 📋 Resumen Ejecutivo

**Proyecto:** Mercado de predicciones descentralizado con liquidación impulsada por IA  
**Hackathon:** Convergence Hackathon (Prize Pool: $40k en tracks CRE & AI + Prediction Markets)  
**Desarrollador:** Andrés Soto (@zswamtech)  
**Fecha inicio:** 27 de enero de 2026  
**Estado actual:** MVP funcional - Frontend necesita fix de lectura de mercados

---

## 🏗️ Arquitectura del Sistema

```
┌─────────────────────────────────────────────────────────────────┐
│                         FRONTEND                                 │
│  Next.js + wagmi + ConnectKit (localhost:3000)                  │
│  - Homepage: lista mercados                                      │
│  - /create: crear nuevos mercados                               │
│  - /market/[id]: ver y apostar en mercados (PENDIENTE)          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    SMART CONTRACT                                │
│  PredictionMarket.sol (Sepolia)                                 │
│  Address: 0x33e7D49d945f3b20e4426440B5DdBB86269689EF            │
│  - createMarket(question) → crea mercado                        │
│  - predict(marketId, YES/NO) → apuesta ETH                      │
│  - requestSettlement(marketId) → solicita liquidación           │
│  - settleMarket(marketId, outcome, confidence) → solo CRE       │
│  - claim(marketId) → reclamar ganancias                         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    CHAINLINK CRE                                 │
│  Chainlink Runtime Environment (off-chain computation)          │
│  Workflow: market-workflow/                                      │
│  - Escucha eventos SettlementRequested                          │
│  - Consulta Gemini AI para determinar resultado                 │
│  - Envía transacción settleMarket al contrato                   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      GEMINI AI                                   │
│  Model: gemini-2.0-flash                                        │
│  - Analiza la pregunta del mercado                              │
│  - Determina YES/NO con nivel de confianza                      │
│  - Responde en formato JSON estructurado                        │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📁 Estructura de Archivos Clave

```
/Users/andressoto/andres-soto-web/prediction-market/
├── CLAUDE_CONTEXT.md          # ← ESTE ARCHIVO (léelo primero)
├── README.md                   # Documentación del proyecto
├── project.yaml               # Configuración CRE
├── secrets.yaml               # Secretos (NO commitear)
│
├── contracts/                 # Smart Contracts
│   ├── PredictionMarket.sol   # Contrato principal
│   └── foundry.toml           # Config Foundry
│
├── market-workflow/           # CRE Workflow
│   ├── workflow.yaml          # Definición del workflow
│   ├── main.ts                # Entry point del workflow
│   ├── gemini.ts              # Integración con Gemini AI
│   ├── trigger.ts             # Lógica del trigger
│   └── action.ts              # Acción on-chain
│
├── frontend/                  # Next.js Frontend
│   ├── src/
│   │   ├── app/
│   │   │   ├── page.tsx       # Homepage (lista mercados)
│   │   │   ├── create/page.tsx # Crear mercado
│   │   │   └── market/[id]/   # Detalle de mercado (PENDIENTE)
│   │   └── lib/
│   │       ├── contract.ts    # ABI y address del contrato
│   │       ├── wagmi.ts       # Configuración wagmi
│   │       └── providers.tsx  # Providers de React
│   └── package.json
│
└── docs/                      # Documentación adicional
```

---

## 🔑 Credenciales y Direcciones Importantes

### Contratos Desplegados (Sepolia)
| Contrato | Address |
|----------|---------|
| PredictionMarket | `0x33e7D49d945f3b20e4426440B5DdBB86269689EF` |
| Keystone Forwarder | `0x15fC6ae953E024d975e77382eEeC56A9101f9F88` |

### Wallets
| Descripción | Address |
|-------------|---------|
| Wallet del workflow | `0x7f21851D163C3477E7527c6669580E15129A4833` |
| Wallet de pruebas | `0xDc86f55EADBd740F8f4381e5c04Ea648d744E1Ba` |

### APIs
| Servicio | Variable de Entorno |
|----------|---------------------|
| Gemini AI | `GEMINI_API_KEY_VAR` en secrets.yaml |
| WalletConnect | `NEXT_PUBLIC_WC_PROJECT_ID` (opcional) |

### Transacciones Exitosas
- **Settlement TX:** `0x448ce0186c8ef757d05e4de8354bf312b2daf57501bed48accd6a2a9b4eb2a72`
- **Create Market TX:** `0xd087200f1662b0669f76280152ea33de04eca1d98c45bade45bc6906b74d1572`

---

## ✅ Lo que YA funciona

1. **Smart Contract** ✅
   - Desplegado y verificado en Sepolia
   - Funciones createMarket, predict, settleMarket funcionando
   - Eventos emitidos correctamente

2. **CRE Workflow** ✅
   - Simulación exitosa con `cre workflow run`
   - Integración con Gemini AI funcionando
   - Settlement on-chain ejecutado correctamente

3. **Frontend - Create Market** ✅
   - Conectar wallet funciona
   - Crear mercados funciona (TX confirmadas en Etherscan)
   - UI responsive y bonita

4. **GitHub Repo** ✅
   - https://github.com/zswamtech/cre-prediction-market
   - README profesional

---

## ❌ Lo que FALTA arreglar/construir

### 🔴 Prioridad Alta

1. **Frontend no lee mercados del contrato**
   - El homepage muestra "0 mercados" pero hay mercados creados
   - Problema probable: RPC o configuración de wagmi
   - **Archivo:** `frontend/src/lib/wagmi.ts`
   - **Posible fix:** Cambiar RPC a uno más confiable o usar Alchemy/Infura

2. **Página de detalle del mercado**
   - Crear `frontend/src/app/market/[id]/page.tsx`
   - Mostrar: pregunta, pools YES/NO, formulario para apostar
   - Botón para request settlement
   - Mostrar resultado si está settled

### 🟡 Prioridad Media

3. **Sincronizar frontend al repo del hackathon**
   - Copiar frontend/ a `~/hackathon/cre-prediction-market/`
   - Push a GitHub

4. **Desplegar frontend en Vercel**
   - Configurar variables de entorno
   - Conectar con GitHub

### 🟢 Nice to Have

5. **Mejorar UX**
   - Loading states
   - Toast notifications
   - Animaciones

6. **Testing**
   - Tests del workflow
   - Tests del frontend

---

## 🚀 Comandos Útiles

### CRE Workflow
```bash
# Navegar al directorio del workflow
cd /Users/andressoto/andres-soto-web/prediction-market/market-workflow

# Simular el workflow
cre workflow run

# Ver logs
cre workflow logs
```

### Frontend
```bash
# Navegar al frontend
cd /Users/andressoto/andres-soto-web/prediction-market/frontend

# Instalar dependencias
pnpm install

# Ejecutar en desarrollo
pnpm dev

# Build para producción
pnpm build
```

### Foundry (Contratos)
```bash
cd /Users/andressoto/andres-soto-web/prediction-market/contracts

# Compilar
forge build

# Desplegar
forge create --rpc-url $SEPOLIA_RPC --private-key $PRIVATE_KEY src/PredictionMarket.sol:PredictionMarket
```

---

## 💡 Conceptos Clave de CRE

### ¿Qué es Chainlink CRE?
**Chainlink Runtime Environment** es un entorno de ejecución descentralizado que permite:
- Ejecutar código TypeScript off-chain de forma segura
- Conectar con APIs externas (como Gemini AI)
- Escribir resultados on-chain de forma verificable

### Componentes de un Workflow CRE
1. **Trigger:** Qué inicia el workflow (eventos on-chain, cron, etc.)
2. **Compute:** Lógica de procesamiento (TypeScript)
3. **Action:** Qué hace con el resultado (transacción on-chain)

### Casos de Uso de CRE
- **Prediction Markets:** Liquidación con IA ✅ (este proyecto)
- **Dynamic NFTs:** Actualizar metadata basado en datos externos
- **DeFi Automation:** Rebalanceo automático de portfolios
- **Gaming:** Generación procedural de contenido
- **Insurance:** Liquidación automática de claims
- **Governance:** Ejecución de propuestas aprobadas

### Ventajas de CRE
- **Descentralizado:** No dependes de un servidor centralizado
- **Verificable:** Los resultados pueden ser auditados
- **Seguro:** Ejecuta en nodos Chainlink de confianza
- **Flexible:** Soporta cualquier lógica en TypeScript

---

## 📚 Recursos para Aprender Más

### Documentación Oficial
- [Chainlink CRE Docs](https://docs.chain.link/chainlink-automation/cre)
- [CRE Bootcamp](https://chain.link/bootcamp)
- [Gemini API Docs](https://ai.google.dev/docs)

### Repos de Referencia
- [CRE Examples](https://github.com/smartcontractkit/cre-examples)
- [Este proyecto](https://github.com/zswamtech/cre-prediction-market)

### Videos
- [SmartCon 2024 - CRE Deep Dive](https://www.youtube.com/watch?v=...)
- [Building with CRE](https://www.youtube.com/watch?v=...)

---

## 🎯 Próximos Pasos para el Hackathon

1. **Arreglar lectura de mercados en frontend**
   - Debug con console.log
   - Probar diferentes RPCs
   - Verificar que el ABI coincida con el contrato

2. **Crear página de detalle de mercado**
   - `/market/[id]/page.tsx`
   - Apostar YES/NO
   - Request settlement
   - Claim winnings

3. **Demo funcional end-to-end**
   - Crear mercado
   - Apostar desde 2 wallets diferentes
   - Request settlement
   - Verificar que Gemini responde
   - Claim ganancias

4. **Video demo de 3-5 minutos**
   - Explicar el problema que resuelve
   - Mostrar el flujo completo
   - Destacar integración CRE + AI

5. **Submission antes del deadline**
   - Verificar requisitos del hackathon
   - Completar formulario de submission
   - Incluir links a repo, demo, video

---

## 🤖 Instrucciones para Claude Futuro

Cuando el usuario abra un nuevo chat y te dé acceso a este archivo:

1. **Lee este archivo completo primero**
2. **Verifica el estado actual** preguntando qué ha cambiado
3. **Revisa la sección "Lo que FALTA"** para saber qué priorizar
4. **Usa los comandos útiles** para navegar el proyecto
5. **Consulta la arquitectura** para entender cómo encajan las piezas

### Preguntas para hacer al usuario:
- "¿Pudiste arreglar el problema de lectura de mercados?"
- "¿Ya creaste la página de detalle de mercado?"
- "¿Cuánto tiempo queda para el deadline del hackathon?"
- "¿Hay algún error específico que estés viendo?"

### Estilo de respuesta preferido:
- Español, profesional pero cercano
- Código con comentarios claros
- Explicaciones paso a paso
- Emojis para hacer más legible

---

## 📝 Changelog

| Fecha | Cambio |
|-------|--------|
| 2026-01-27 | Proyecto iniciado, CRE workflow funcionando |
| 2026-01-27 | Smart contract desplegado en Sepolia |
| 2026-01-27 | Frontend creado con Next.js + wagmi |
| 2026-01-27 | Mercados creados exitosamente on-chain |
| 2026-01-27 | Problema identificado: frontend no lee mercados |

---

*Última actualización: 27 de enero de 2026*
*Creado con ❤️ por Claude Opus 4.5 para Andrés Soto*