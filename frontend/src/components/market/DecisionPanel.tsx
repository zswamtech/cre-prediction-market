import { formatEther } from "viem";
import { Card } from "@/components/ui/Card";

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

export function DecisionPanel({
  market,
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

      {/* Oracle IoT */}
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

      {/* Weather */}
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

function MetricBox({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div className="bg-gray-900/50 rounded-lg p-3">
      <p className="text-xs text-gray-400">{label}</p>
      <p className="text-lg text-white font-semibold">{value ?? "N/A"}</p>
    </div>
  );
}
