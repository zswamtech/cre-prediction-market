import { formatEther } from "viem";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

type OracleMetrics = {
  address?: string;
  metrics?: {
    noiseLevelDb?: number;
    safetyIndex?: number;
    nearbyConstruction?: boolean;
    publicTransportStatus?: string;
  };
};

type WeatherMetrics = {
  time?: string;
  temperatureC?: number;
  precipitationMm?: number;
  windSpeedKmh?: number;
  sourceUrl: string;
};

export type FlightOracleData = {
  flightId?: string;
  airline?: string;
  flightNumber?: string;
  departureAirport?: string;
  arrivalAirport?: string;
  scheduledDepartureUtc?: string | null;
  actualDepartureUtc?: string | null;
  status?: string;
  delayMinutes?: number | null;
  thresholdMinutes?: number;
  tier2ThresholdMinutes?: number;
  breachDetected?: boolean;
  expectedVerdict?: string;
  payoutPercent?: number;
  payoutTier?: number;
  payoutReason?: string;
  date?: string;
  evaluatedAt?: string;
  source?: string;
};

export function DecisionPanel({
  market,
  isFlightPolicy,
  flightData,
  flightLoading,
  flightError,
  oracleData,
  oracleLoading,
  oracleError,
  oracleBaseUrl,
  weatherData,
  weatherLoading,
  weatherError,
  weatherLatitude,
  weatherLongitude,
  weatherTimezone,
  onClaim,
  isProcessing,
}: {
  market: {
    settled: boolean;
    outcome: number;
    confidence: number;
    totalYesPool: bigint;
    totalNoPool: bigint;
  };
  isFlightPolicy: boolean;
  flightData: FlightOracleData | null;
  flightLoading: boolean;
  flightError: string | null;
  oracleData: OracleMetrics | null;
  oracleLoading: boolean;
  oracleError: string | null;
  oracleBaseUrl: string;
  weatherData: WeatherMetrics | null;
  weatherLoading: boolean;
  weatherError: string | null;
  weatherLatitude: number;
  weatherLongitude: number;
  weatherTimezone: string;
  onClaim: () => void;
  isProcessing: boolean;
}) {
  return (
    <div className="space-y-6">
      {/* Pool */}
      <Card>
        <h2 className="text-lg font-semibold text-white mb-2">Pool de garantias</h2>
        <p className="text-xs text-gray-500 mb-4">
          SI = se activa payout · NO = sin reclamo
        </p>
        <div className="space-y-3">
          <div className="flex justify-between items-center p-3 bg-gray-900/50 rounded-lg">
            <span className="text-gray-300">Pool SI (payout)</span>
            <span className="font-mono text-green-400 text-lg">
              {formatEther(market.totalYesPool)} ETH
            </span>
          </div>
          <div className="flex justify-between items-center p-3 bg-gray-900/50 rounded-lg">
            <span className="text-gray-300">Pool NO (sin reclamo)</span>
            <span className="font-mono text-red-400 text-lg">
              {formatEther(market.totalNoPool)} ETH
            </span>
          </div>
        </div>
      </Card>

      {/* Flight Oracle (for flight policies) */}
      {isFlightPolicy && (
        <Card>
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <span>✈️</span> Oracle de vuelo
          </h2>
          {flightLoading && (
            <p className="text-gray-400 text-sm animate-pulse">Consultando oracle de vuelos...</p>
          )}
          {flightError && (
            <p className="text-red-400 text-sm">
              Oracle no disponible: {flightError}
            </p>
          )}
          {!flightLoading && !flightError && flightData && (
            <div className="space-y-4">
              {/* Flight info header */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white font-bold text-lg">
                    {flightData.airline} {flightData.flightNumber}
                  </p>
                  <p className="text-gray-400 text-sm">
                    {flightData.departureAirport} → {flightData.arrivalAirport}
                  </p>
                </div>
                <Badge
                  variant={
                    flightData.status === "CANCELLED"
                      ? "error"
                      : flightData.status === "DELAYED"
                        ? "active"
                        : "settled"
                  }
                >
                  {flightData.status === "CANCELLED"
                    ? "Cancelado"
                    : flightData.status === "DELAYED"
                      ? "Retrasado"
                      : flightData.status === "ON_TIME"
                        ? "A tiempo"
                        : flightData.status ?? "Desconocido"}
                </Badge>
              </div>

              {/* Delay metrics */}
              <div className="grid grid-cols-2 gap-3">
                <MetricBox
                  label="Retraso"
                  value={
                    flightData.delayMinutes !== null && flightData.delayMinutes !== undefined
                      ? `${flightData.delayMinutes} min`
                      : flightData.status === "CANCELLED"
                        ? "Cancelado"
                        : "N/A"
                  }
                  highlight={flightData.breachDetected}
                />
                <MetricBox
                  label="Threshold"
                  value={`${flightData.thresholdMinutes ?? 45} min`}
                />
              </div>

              {/* Graduated Payout Tiers */}
              <div className="border border-gray-700 rounded-xl p-4 bg-black/20">
                <h3 className="text-sm font-medium text-gray-300 mb-3">
                  Pago escalonado
                </h3>
                <div className="space-y-2">
                  {/* Tier 1 */}
                  <div
                    className={`flex items-center justify-between p-2.5 rounded-lg border transition ${
                      flightData.payoutTier === 1
                        ? "border-amber-500 bg-amber-500/10"
                        : "border-gray-700/50 bg-gray-900/30"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {flightData.payoutTier === 1 && (
                        <span className="text-amber-400">●</span>
                      )}
                      <span className={`text-sm ${flightData.payoutTier === 1 ? "text-amber-200" : "text-gray-400"}`}>
                        Tier 1: Retraso {">="} {flightData.thresholdMinutes ?? 45} min
                      </span>
                    </div>
                    <span className={`font-bold text-sm ${flightData.payoutTier === 1 ? "text-amber-300" : "text-gray-500"}`}>
                      50%
                    </span>
                  </div>
                  {/* Tier 2 */}
                  <div
                    className={`flex items-center justify-between p-2.5 rounded-lg border transition ${
                      flightData.payoutTier === 2
                        ? "border-green-500 bg-green-500/10"
                        : "border-gray-700/50 bg-gray-900/30"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {flightData.payoutTier === 2 && (
                        <span className="text-green-400">●</span>
                      )}
                      <span className={`text-sm ${flightData.payoutTier === 2 ? "text-green-200" : "text-gray-400"}`}>
                        Tier 2: Retraso {">="} {flightData.tier2ThresholdMinutes ?? 90} min o cancelado
                      </span>
                    </div>
                    <span className={`font-bold text-sm ${flightData.payoutTier === 2 ? "text-green-300" : "text-gray-500"}`}>
                      100%
                    </span>
                  </div>
                </div>

                {/* Current payout */}
                {flightData.breachDetected && (
                  <div className="mt-3 pt-3 border-t border-gray-700/50 text-center">
                    <p className="text-xs text-gray-400 mb-1">Payout aplicable</p>
                    <p className="text-2xl font-bold text-white">
                      {flightData.payoutPercent ?? 0}%
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {flightData.payoutReason}
                    </p>
                  </div>
                )}
                {!flightData.breachDetected && (
                  <div className="mt-3 pt-3 border-t border-gray-700/50 text-center">
                    <p className="text-xs text-gray-400">Sin breach detectado — sin payout</p>
                  </div>
                )}
              </div>

              {/* Times */}
              {flightData.scheduledDepartureUtc && (
                <div className="text-xs text-gray-500 space-y-1">
                  <p>Programado: {new Date(flightData.scheduledDepartureUtc).toLocaleString()}</p>
                  {flightData.actualDepartureUtc && (
                    <p>Real: {new Date(flightData.actualDepartureUtc).toLocaleString()}</p>
                  )}
                  {flightData.evaluatedAt && (
                    <p>Evaluado: {new Date(flightData.evaluatedAt).toLocaleString()}</p>
                  )}
                  <p>Fuente: {flightData.source ?? "flight-oracle"}</p>
                </div>
              )}
            </div>
          )}
          {!flightLoading && !flightError && !flightData && (
            <p className="text-gray-400 text-sm">No hay datos de vuelo disponibles.</p>
          )}
        </Card>
      )}

      {/* Oracle IoT (for property policies) */}
      {!isFlightPolicy && (
        <Card>
          <h2 className="text-lg font-semibold text-white mb-4">
            Metricas urbanas (Oracle IoT)
          </h2>
          {oracleLoading && (
            <p className="text-gray-400 text-sm">Cargando datos del oraculo...</p>
          )}
          {oracleError && (
            <p className="text-red-400 text-sm">
              Oraculo no disponible: {oracleError}
            </p>
          )}
          {!oracleLoading && !oracleError && oracleData && (
            <div className="space-y-4 text-sm text-gray-300">
              <div>
                <span className="text-gray-400">Direccion:</span>{" "}
                <span className="text-white">{oracleData.address ?? "N/A"}</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <MetricBox label="Ruido (dB)" value={oracleData.metrics?.noiseLevelDb} />
                <MetricBox label="Indice de seguridad" value={oracleData.metrics?.safetyIndex} />
                <MetricBox
                  label="Obras"
                  value={
                    oracleData.metrics?.nearbyConstruction === undefined
                      ? "N/A"
                      : oracleData.metrics?.nearbyConstruction
                        ? "Si"
                        : "No"
                  }
                />
                <MetricBox label="Transporte" value={oracleData.metrics?.publicTransportStatus} />
              </div>
              <p className="text-xs text-gray-500">Fuente: {oracleBaseUrl}</p>
            </div>
          )}
          {!oracleLoading && !oracleError && !oracleData && (
            <p className="text-gray-400 text-sm">No hay datos del oraculo.</p>
          )}
        </Card>
      )}

      {/* Weather (property policies only) */}
      {!isFlightPolicy && (
        <Card>
          <h2 className="text-lg font-semibold text-white mb-4">
            Clima (Open-Meteo)
          </h2>
          {weatherLoading && (
            <p className="text-gray-400 text-sm">Cargando clima...</p>
          )}
          {weatherError && (
            <p className="text-red-400 text-sm">
              Clima no disponible: {weatherError}
            </p>
          )}
          {!weatherLoading && !weatherError && weatherData && (
            <div className="space-y-4 text-sm text-gray-300">
              <div>
                <span className="text-gray-400">Ubicacion:</span>{" "}
                <span className="text-white">
                  {weatherLatitude}, {weatherLongitude}
                </span>
              </div>
              <div>
                <span className="text-gray-400">Hora:</span>{" "}
                <span className="text-white">
                  {weatherData.time ?? "N/A"} ({weatherTimezone})
                </span>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <MetricBox label="Temperatura (°C)" value={weatherData.temperatureC} />
                <MetricBox label="Precipitacion (mm)" value={weatherData.precipitationMm} />
                <MetricBox label="Viento (km/h)" value={weatherData.windSpeedKmh} />
              </div>
            </div>
          )}
          {!weatherLoading && !weatherError && !weatherData && (
            <p className="text-gray-400 text-sm">No hay datos de clima.</p>
          )}
        </Card>
      )}

      {/* Settlement result */}
      {market.settled && (
        <Card>
          <h2 className="text-lg font-semibold text-white mb-4">Resultado</h2>
          <div className="text-center py-4">
            <p className="text-gray-400 mb-2">Veredicto</p>
            <div
              className={`text-4xl font-bold ${
                market.outcome === 0 ? "text-green-500" : "text-red-500"
              }`}
            >
              {market.outcome === 0 ? "SI (payout)" : "NO (sin reclamo)"}
            </div>
            <p className="text-sm text-gray-500 mt-2">
              Confianza: {market.confidence / 100}%
            </p>
            <p className="text-xs text-gray-500 mt-1">
              Si aportaste al resultado ganador, puedes reclamar.
            </p>
          </div>
          <button
            onClick={onClaim}
            disabled={isProcessing}
            className="w-full mt-4 bg-green-600 hover:bg-green-700 disabled:bg-gray-700 text-white font-bold py-3 rounded-xl transition"
          >
            Reclamar
          </button>
        </Card>
      )}
    </div>
  );
}

function MetricBox({
  label,
  value,
  highlight,
}: {
  label: string;
  value?: string | number | null;
  highlight?: boolean;
}) {
  return (
    <div className={`rounded-lg p-3 ${highlight ? "bg-amber-900/20 border border-amber-700/40" : "bg-gray-900/50"}`}>
      <p className="text-xs text-gray-400">{label}</p>
      <p className={`text-lg font-semibold ${highlight ? "text-amber-300" : "text-white"}`}>
        {value ?? "N/A"}
      </p>
    </div>
  );
}
