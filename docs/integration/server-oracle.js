// save this as `server-oracle.js` in your alojamientos-medellin folder
// run with: node server-oracle.js

const http = require('http');
const url = require('url');
const port = Number(process.env.PORT || 3001); // Render/Cloud uses PORT
const ALLOW_ORIGIN = process.env.ALLOW_ORIGIN || '*';

// DATOS MOCK: Aquí conectarías tu lógica real de Postgres
function getPropertyData(marketId) {
    const mockDb = {
        "1": { occupancy: 85, avgPrice: 150000, riskScore: 10, region: "El Poblado" }, // Riesgo Bajo
        "2": { occupancy: 45, avgPrice: 85000, riskScore: 65, region: "Laureles" },   // Riesgo Alto
        "default": { occupancy: 60, avgPrice: 100000, riskScore: 30 }
    };
    return mockDb[marketId] || mockDb["default"];
}

// "IOT SENSOR NETWORK" - Simulación de datos urbanos en tiempo real
function getUrbanMetrics(marketId) {
    const sensorData = {
        "1": { // Barrio: Pobla-Ruidoso
            address: "Calle 10 #43-20, El Poblado",
            metrics: {
                noiseLevelDb: 85,        // 🚨 MUY RUIDOSO (Breach!)
                safetyIndex: 8.5,        // Seguro
                nearbyConstruction: true, // 🚨 OBRAS (Breach!)
                publicTransportStatus: "Operational"
            }
        },
        "2": { // Barrio: Oasis-Tranquilo
            address: "Circular 4ta #70, Laureles",
            metrics: {
                noiseLevelDb: 45,        // Tranquilo
                safetyIndex: 9.0,        // Muy seguro
                nearbyConstruction: false,
                publicTransportStatus: "Operational"
            }
        },
        "default": {
            metrics: { noiseLevelDb: 50, safetyIndex: 7, nearbyConstruction: false }
        }
    };
    return sensorData[marketId] || sensorData["default"];
}

const server = http.createServer((req, res) => {
  const { pathname } = url.parse(req.url || '/', true);

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', ALLOW_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204; // No Content for preflight
    res.end();
    return;
  }

  // Healthcheck
  if (pathname === '/health' || pathname === '/') {
    res.end(JSON.stringify({ ok: true, service: 'alojamientos-medellin-oracle', version: '1.0.0', port }));
    return;
  }

  // Simula API: /api/market/:id
  if (pathname && pathname.startsWith('/api/market/')) {
    const id = pathname.split('/').pop();
    const data = getUrbanMetrics(id);
    console.log(`[IoT Network] Enviando métricas para Zona ID: ${id}`);
    console.log(` > Ruido: ${data.metrics.noiseLevelDb}dB | Obras: ${data.metrics.nearbyConstruction}`);
    res.end(JSON.stringify({ success: true, data }));
    return;
  }

  res.statusCode = 404;
  res.end(JSON.stringify({ success: false, error: 'Not Found' }));
});

server.listen(port, '0.0.0.0', () => console.log(`
🏠 ALOJAMIENTOS MEDELLIN - ORACLE NODE
---------------------------------------
Listening on port ${port} (0.0.0.0)
CORS: ${ALLOW_ORIGIN}
Status: LIVE
Ready to serve Real World Assets to Chainlink CRE
---------------------------------------
`));
