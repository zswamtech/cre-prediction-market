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
  isV3,
  revealFlightOracle,
  flightReference,
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
  isV3: boolean;
  revealFlightOracle: boolean;
  flightReference?: {
    flightId?: string | null;
    flightDate?: string | null;
    thresholdMinutes?: number | null;
    tier2ThresholdMinutes?: number | null;
  };
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
  const thresholdMinutes = flightData?.thresholdMinutes ?? 45;
  const tier2ThresholdMinutes = flightData?.tier2ThresholdMinutes ?? 90;
  const delayMinutes = flightData?.delayMinutes ?? null;
  const normalizedStatus = (flightData?.status ?? "").toUpperCase();
  const fallbackPayoutTier =
    normalizedStatus === "CANCELLED"
      ? 2
      : typeof delayMinutes === "number"
        ? delayMinutes >= tier2ThresholdMinutes
          ? 2
          : delayMinutes >= thresholdMinutes
            ? 1
            : 0
        : 0;
  const effectivePayoutTier = flightData?.payoutTier ?? fallbackPayoutTier;
  const effectivePayoutPercent =
    flightData?.payoutPercent ??
    (effectivePayoutTier === 2 ? 100 : effectivePayoutTier === 1 ? 50 : 0);
  const effectivePayoutReason =
    flightData?.payoutReason ??
    (effectivePayoutTier === 2
      ? "Tier 2 aplicado (>= 90 min o cancelado)."
      : effectivePayoutTier === 1
        ? "Tier 1 aplicado (>= 45 min)."
        : "Sin payout.");

  return (
    <div className="space-y-6">
      {/* Pool */}
      <Card>
        <h2 className="text-lg font-semibold text-white mb-2">
          {isFlightPolicy
            ? isV3
              ? "Pool financiero (insurance-first)"
              : "Pool de mercado (V1 compat)"
            : "Pool de garantias"}
        </h2>
        <p className="text-xs text-gray-500 mb-4">
          {isFlightPolicy
            ? isV3
              ? "SI = prima del viajero · NO = capital de cobertura del asegurador"
              : "Modo V1: SI/NO son pools de resultado (no póliza ticket-based)."
            : "SI = se activa payout · NO = sin reclamo"}
        </p>
        {isFlightPolicy && !isV3 && (
          <div className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-200">
            Estás en V1 compat: el claim paga por pool ganador, no por porcentaje del valor del ticket.
            Para payout por Tier (50%/100%) debes usar mercado V3.
          </div>
        )}
        <div className="space-y-3">
          <div className="flex justify-between items-center p-3 bg-gray-900/50 rounded-lg">
            <span className="text-gray-300">
              {isFlightPolicy ? "Pool SI (prima viajero)" : "Pool SI (payout)"}
            </span>
            <span className="font-mono text-green-400 text-lg">
              {formatEther(market.totalYesPool)} ETH
            </span>
          </div>
          <div className="flex justify-between items-center p-3 bg-gray-900/50 rounded-lg">
            <span className="text-gray-300">
              {isFlightPolicy ? "Pool NO (cobertura asegurador)" : "Pool NO (sin reclamo)"}
            </span>
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
          {!revealFlightOracle && (
            <div className="rounded-lg border border-sky-600/40 bg-sky-950/20 p-3 text-sm text-sky-100 space-y-2">
              <p className="font-medium">Resultado del vuelo bloqueado hasta la liquidación.</p>
              <p className="text-xs text-sky-200/90">
                Etapa actual: compra/fondeo. Se mostrará estado real del vuelo y payout aplicable
                después de ejecutar settlement (CRE).
              </p>
              <div className="text-xs text-sky-200/80 space-y-1">
                {flightReference?.flightId && (
                  <p>Vuelo configurado: {flightReference.flightId}</p>
                )}
                {flightReference?.flightDate && (
                  <p>Fecha de póliza: {flightReference.flightDate}</p>
                )}
                <p>
                  Threshold Tier 1: {flightReference?.thresholdMinutes ?? 45} min · Tier 2:{" "}
                  {flightReference?.tier2ThresholdMinutes ?? 90} min/cancelado
                </p>
              </div>
            </div>
          )}
          {revealFlightOracle && (
            <>
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
                      effectivePayoutTier === 1
                        ? "border-amber-500 bg-amber-500/10"
                        : "border-gray-700/50 bg-gray-900/30"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {effectivePayoutTier === 1 && (
                        <span className="text-amber-400">●</span>
                      )}
                      <span className={`text-sm ${effectivePayoutTier === 1 ? "text-amber-200" : "text-gray-400"}`}>
                        Tier 1: Retraso {">="} {thresholdMinutes} min
                      </span>
                    </div>
                    <span className={`font-bold text-sm ${effectivePayoutTier === 1 ? "text-amber-300" : "text-gray-500"}`}>
                      50%
                    </span>
                  </div>
                  {/* Tier 2 */}
                  <div
                    className={`flex items-center justify-between p-2.5 rounded-lg border transition ${
                      effectivePayoutTier === 2
                        ? "border-green-500 bg-green-500/10"
                        : "border-gray-700/50 bg-gray-900/30"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {effectivePayoutTier === 2 && (
                        <span className="text-green-400">●</span>
                      )}
                      <span className={`text-sm ${effectivePayoutTier === 2 ? "text-green-200" : "text-gray-400"}`}>
                        Tier 2: Retraso {">="} {tier2ThresholdMinutes} min o cancelado
                      </span>
                    </div>
                    <span className={`font-bold text-sm ${effectivePayoutTier === 2 ? "text-green-300" : "text-gray-500"}`}>
                      100%
                    </span>
                  </div>
                </div>

                {/* Current payout */}
                {flightData.breachDetected && (
                  <div className="mt-3 pt-3 border-t border-gray-700/50 text-center">
                    <p className="text-xs text-gray-400 mb-1">Payout aplicable</p>
                    <p className="text-2xl font-bold text-white">
                      {effectivePayoutPercent}%
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {effectivePayoutReason}
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
            </>
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
            type="button"
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
