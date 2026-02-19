# Convergence Hackathon - Formulario Airtable (ES)

Texto listo para copiar/pegar en el formulario.

## Nombre del proyecto
FairLease

## Descripción del proyecto de 1 línea (menos de ~80-100 caracteres)
Seguro paramétrico de retraso de vuelos con CRE + IA y liquidación onchain.

## Descripción completa del proyecto
FairLease es una capa de seguros paramétricos para experiencias reales, con enfoque principal en retrasos y cancelaciones de vuelos.

En lugar de reclamos manuales y lentos, FairLease permite que los usuarios participen en dos pools de cobertura (SÍ = payout, NO = sin reclamo) y resuelve automáticamente la póliza con ejecución verificable.

Para pólizas de vuelo, el workflow de Chainlink CRE:
1. Lee la póliza desde el contrato en Sepolia.
2. Consulta señales del oráculo de vuelos (retraso/cancelación).
3. Consulta Gemini con formato JSON estricto.
4. Si hay rate limit (429), aplica fallback determinístico paramétrico.
5. Escribe el veredicto onchain para habilitar el claim del lado ganador.

Además, mantenemos pólizas de calidad de vida en inmuebles (ruido/seguridad/obras/clima) como vertical secundaria para demostrar extensibilidad multi-sector.

## ¿Cómo está construido?
- Frontend: Next.js para crear pólizas, aportar al pool, solicitar liquidación y reclamar.
- Smart contracts: Solidity en Sepolia.
- Workflow CRE (TypeScript -> WASM):
  - Lectura/escritura EVM para settlement.
  - Integración de datos offchain:
    - Oracle de vuelos (retraso/cancelación).
    - Oracle urbano IoT (caso inmueble).
    - Open-Meteo (clima).
    - Gemini (resultado IA).
- Regla de ventana mínima: no liquida antes de `minMarketAgeMinutes`.
- Trazabilidad: decision trace con reglas y umbrales para auditoría.

## ¿Qué desafíos te enfrentaste?
- Mapear identificadores reales (flight code + fecha / property ID) a condiciones onchain de forma determinística.
- Diseñar prompt/parseo estricto para evitar resultados ambiguos en IA.
- Mantener resiliencia con fallback determinístico cuando Gemini responde 429.
- Alinear wallet RPC y frontend RPC para evitar mismatch en confirmaciones.
- Endurecer seguridad operativa de demo (sin logs sensibles, sin secretos en repo).

## Enlace al repositorio del proyecto
https://github.com/zswamtech/cre-prediction-market

## Uso de Chainlink (enlace a fragmento de código específico)
- Workflow CRE (triggers y orquestación):
  - https://github.com/zswamtech/cre-prediction-market/blob/main/market-workflow/main.ts
- Settlement HTTP (flujo principal):
  - https://github.com/zswamtech/cre-prediction-market/blob/main/market-workflow/httpCallback.ts
- Integración IA + oracle (flight/property/weather):
  - https://github.com/zswamtech/cre-prediction-market/blob/main/market-workflow/gemini.ts
- Configuración de targets CRE:
  - https://github.com/zswamtech/cre-prediction-market/blob/main/project.yaml
- Mapeo de secretos CRE:
  - https://github.com/zswamtech/cre-prediction-market/blob/main/secrets.yaml
- Contrato de mercado:
  - https://github.com/zswamtech/cre-prediction-market/blob/main/contracts/src/PredictionMarket.sol

## Demostración del proyecto
https://youtu.be/<YOUR_VIDEO_ID>

## ¿A qué pista(s) de premios Chainlink te estás postulando?
- CRE e IA
- Mercados de predicción
- Riesgo y cumplimiento

## ¿A qué pista(s) de patrocinador te estás postulando?
World / World ID (opcional, fase siguiente para anti-fraude Proof of Humanity).

## Nombre del remitente
Andrés Soto

## Correo electrónico del remitente
ansoto1604@gmail.com

## ¿Estás participando en un equipo o individualmente?
Individual
