"use client";

import { ConnectKitButton } from "connectkit";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { formatEther, parseEther, encodeAbiParameters, concat, toHex, keccak256, encodePacked } from "viem";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  PREDICTION_MARKET_ADDRESS,
  PREDICTION_MARKET_ABI,
} from "@/lib/contract";

const SEP_CHAINLINK_FORWARDER = "0x15fc6ae953e024d975e77382eeec56a9101f9f88";

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

export default function MarketDetail() {
  const { id } = useParams();
  const router = useRouter();
  const { isConnected } = useAccount();
  const isTest = process.env.NEXT_PUBLIC_TEST_MODE === '1';
  const oracleBaseUrl =
    process.env.NEXT_PUBLIC_ORACLE_BASE_URL || "http://127.0.0.1:3001";
  const weatherLatitude = parseFloat(process.env.NEXT_PUBLIC_WEATHER_LAT || "6.2442");
  const weatherLongitude = parseFloat(process.env.NEXT_PUBLIC_WEATHER_LON || "-75.5812");
  const weatherTimezone = process.env.NEXT_PUBLIC_WEATHER_TIMEZONE || "America/Bogota";
  const [amount, setAmount] = useState("");
  const [selectedOutcome, setSelectedOutcome] = useState<0 | 1 | null>(null); // 0 = Sí (payout), 1 = No (sin reclamo)
  const [testHash, setTestHash] = useState<string | null>(null);
  const [oracleData, setOracleData] = useState<OracleMetrics | null>(null);
  const [oracleLoading, setOracleLoading] = useState(false);
  const [oracleError, setOracleError] = useState<string | null>(null);
  const [weatherData, setWeatherData] = useState<WeatherMetrics | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [weatherError, setWeatherError] = useState<string | null>(null);

  // Parse ID securely
  const marketId = id ? BigInt(Array.isArray(id) ? id[0] : id) : undefined;

  const { data: marketResult, isLoading, refetch } = useReadContract({
    address: PREDICTION_MARKET_ADDRESS,
    abi: PREDICTION_MARKET_ABI,
    functionName: "getMarket",
    args: marketId !== undefined ? [marketId] : undefined,
    query: {
      enabled: marketId !== undefined,
      // Disable cache for fresh data
      gcTime: 0,
      staleTime: 0,
    }
  });

  // Oracle "zone/property" ID:
  // - Prefer parsing from the onchain question (e.g., "Propiedad ID 2")
  // - Fall back to the marketId (demo mode)
  const oracleZoneId =
    (marketResult as any)?.question?.match(/(?:propiedad|property)\s*id\s*(\d+)/i)?.[1] ??
    (marketId !== undefined ? marketId.toString() : undefined);

  const { data: hash, writeContract, isPending: isWritePending, error: writeError } = useWriteContract();
  
  // Debug effect
  useEffect(() => {
    if (hash) console.log("Transaction Hash Generated:", hash);
  }, [hash]);

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
  });

  // Auto-refresh logic
  useEffect(() => {
    const interval = setInterval(() => {
      console.log("🔄 Refreshing market...");
      refetch();
    }, 5000);
    return () => clearInterval(interval);
  }, [refetch]);

  useEffect(() => {
    if (!oracleZoneId) return;

    let cancelled = false;
    const baseUrl = oracleBaseUrl.replace(/\/+$/, "");

    const fetchOracle = async () => {
      setOracleLoading(true);
      setOracleError(null);

      try {
        const response = await fetch(`${baseUrl}/api/market/${oracleZoneId}`);
        if (!response.ok) {
          throw new Error(`Oracle responded with ${response.status}`);
        }
        const json = await response.json();
        if (!json?.success) {
          throw new Error(json?.error || "Oracle response invalid");
        }
        if (!cancelled) {
          setOracleData(json.data ?? null);
        }
      } catch (error) {
        if (!cancelled) {
          setOracleData(null);
          setOracleError(error instanceof Error ? error.message : "Oracle error");
        }
      } finally {
        if (!cancelled) {
          setOracleLoading(false);
        }
      }
    };

    fetchOracle();
    const interval = setInterval(fetchOracle, 15000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [oracleZoneId, oracleBaseUrl]);

  useEffect(() => {
    let cancelled = false;

    const sourceUrl =
      `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${encodeURIComponent(String(weatherLatitude))}` +
      `&longitude=${encodeURIComponent(String(weatherLongitude))}` +
      `&current=temperature_2m,precipitation,wind_speed_10m` +
      `&timezone=${encodeURIComponent(weatherTimezone)}`;

    const fetchWeather = async () => {
      setWeatherLoading(true);
      setWeatherError(null);

      try {
        const response = await fetch(sourceUrl);
        if (!response.ok) {
          throw new Error(`Weather responded with ${response.status}`);
        }
        const json = await response.json();
        const current = json?.current;
        if (!current) {
          throw new Error("Weather response invalid");
        }

        if (!cancelled) {
          setWeatherData({
            time: current.time,
            temperatureC: current.temperature_2m,
            precipitationMm: current.precipitation,
            windSpeedKmh: current.wind_speed_10m,
            sourceUrl,
          });
        }
      } catch (error) {
        if (!cancelled) {
          setWeatherData(null);
          setWeatherError(error instanceof Error ? error.message : "Weather error");
        }
      } finally {
        if (!cancelled) {
          setWeatherLoading(false);
        }
      }
    };

    fetchWeather();
    const interval = setInterval(fetchWeather, 15 * 60 * 1000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [weatherLatitude, weatherLongitude, weatherTimezone]);

  useEffect(() => {
    if (isSuccess) {
      setAmount("");
      setSelectedOutcome(null);
      refetch();
    }
  }, [isSuccess, refetch]);

  const { data: ownerAddress } = useReadContract({
    address: PREDICTION_MARKET_ADDRESS,
    abi: PREDICTION_MARKET_ABI,
    functionName: "owner",
  });

  // Safe check for owner without calling hooks conditionally
  const userAccount = useAccount();
  const isOwner = isConnected && ownerAddress && userAccount.address === ownerAddress;
  const [adminProcessing, setAdminProcessing] = useState(false);

  const handleSettleMarket = async (outcome: 0 | 1) => {
    if (!marketId || !isOwner) return;
    setAdminProcessing(true);

    try {
      // 1. Set Forwarder to self
      console.log("Setting forwarder to self...");
      await writeContract({
        address: PREDICTION_MARKET_ADDRESS,
        abi: PREDICTION_MARKET_ABI,
        functionName: "setForwarderAddress",
        args: [useAccount().address!],
      });
      // Note: In a real app we'd wait for tx confirmation here properly, 
      // but wagmi's writeContract is async. 
      // For this simplified UI, user might need to click multiple times or we rely on user waiting.
      // Better flow: 3 separate buttons/steps or a sequenced call if we had a multicall (which we don't for these permissions).
      
      alert(
        "Paso 1 enviado: 'Set Forwarder'. Confirma en tu wallet, espera a que mine, y luego vuelve a intentar."
      );
    } catch (err) {
      console.error(err);
    }
    setAdminProcessing(false);
  };

  const handleForceSettleStep2 = (outcome: 0 | 1) => {
    if (!marketId) return;
    // Construct Report: [0x01] + [marketId, outcome, confidence]
    // confidence 10000 = 100%
    const reportData = encodeAbiParameters(
      [
        { type: "uint256" },
        { type: "uint8" }, // Prediction enum
        { type: "uint16" },
      ],
      [marketId, outcome, 10000]
    );

    const fullReport = concat([
      "0x01", // Prefix for settlement
      reportData
    ]);

    writeContract({
      address: PREDICTION_MARKET_ADDRESS,
      abi: PREDICTION_MARKET_ABI,
      functionName: "onReport",
      args: ["0x", fullReport], // empty metadata
    });
  };

  const handleRestoreForwarder = () => {
    writeContract({
      address: PREDICTION_MARKET_ADDRESS,
      abi: PREDICTION_MARKET_ABI,
      functionName: "setForwarderAddress",
      args: [SEP_CHAINLINK_FORWARDER],
    });
  };

  const handleClaim = () => {
    if (!marketId) return;
    writeContract({
      address: PREDICTION_MARKET_ADDRESS,
      abi: PREDICTION_MARKET_ABI,
      functionName: "claim",
      args: [marketId],
    });
  };

  if (!marketId) return <div className="p-8 text-center">ID de póliza inválido</div>;
  if (isLoading) return <div className="p-8 text-center text-white">Cargando datos de la póliza...</div>;
  if (!marketResult) return <div className="p-8 text-center text-red-400">Póliza no encontrada</div>;


  const handlePredict = () => {
    if (!amount || selectedOutcome === null || marketId === undefined) return;
    
    writeContract({
      address: PREDICTION_MARKET_ADDRESS,
      abi: PREDICTION_MARKET_ABI,
      functionName: "predict",
      args: [marketId, selectedOutcome],
      value: parseEther(amount),
    });
  };

  const handleRequestSettlement = () => {
    if (!marketId) return;
    // In E2E test mode, simulate a transaction hash without wallet
    if (isTest) {
      setTestHash(
        '0x' + 'e2e'.padEnd(8, '0') + 'cafebabedeadbeef'.padEnd(56, '0')
      );
      return;
    }
    writeContract({
      address: PREDICTION_MARKET_ADDRESS,
      abi: PREDICTION_MARKET_ABI,
      functionName: "requestSettlement",
      args: [marketId],
    });
  };

  const market = marketResult;

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="mb-8">
        <Link 
          href="/" 
          className="text-gray-400 hover:text-white transition flex items-center gap-2 mb-4"
        >
          ← Volver a pólizas
        </Link>
        <header className="flex justify-between items-start">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <span className="text-xs bg-purple-600/20 text-purple-400 px-2 py-1 rounded">
                Póliza #{marketId.toString()}
              </span>
              {market.settled ? (
                <span className="text-xs bg-green-600/20 text-green-400 px-2 py-1 rounded">
                  ✓ Resuelta
                </span>
              ) : (
                <span className="text-xs bg-yellow-600/20 text-yellow-400 px-2 py-1 rounded">
                  ● Activa
                </span>
              )}
            </div>
            <h1 className="text-3xl font-bold text-white mb-4">
              {market.question}
            </h1>
          </div>
          <ConnectKitButton />
        </header>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="space-y-6">
          <div className="bg-gray-800/50 backdrop-blur rounded-xl p-6 border border-gray-700">
            <h2 className="text-xl font-semibold text-white mb-2">Pool de garantías (demo)</h2>
            <p className="text-xs text-gray-500 mb-4">
              SÍ = se activa payout · NO = sin reclamo
            </p>
            <div className="space-y-4">
              <div className="flex justify-between items-center p-3 bg-gray-700/30 rounded-lg">
                <span className="text-gray-300">Pool SÍ (payout)</span>
                <span className="font-mono text-green-400 text-lg">
                  {formatEther(market.totalYesPool)} ETH
                </span>
              </div>
              <div className="flex justify-between items-center p-3 bg-gray-700/30 rounded-lg">
                <span className="text-gray-300">Pool NO (sin reclamo)</span>
                <span className="font-mono text-red-400 text-lg">
                  {formatEther(market.totalNoPool)} ETH
                </span>
              </div>
            </div>
          </div>

          <div className="bg-gray-800/50 backdrop-blur rounded-xl p-6 border border-gray-700">
            <h2 className="text-xl font-semibold text-white mb-4">
              Métricas urbanas (Oracle IoT)
            </h2>
            {oracleLoading && (
              <p className="text-gray-400 text-sm">Cargando datos del oráculo...</p>
            )}
            {oracleError && (
              <p className="text-red-400 text-sm">
                Oráculo no disponible: {oracleError}
              </p>
            )}
            {!oracleLoading && !oracleError && oracleData && (
              <div className="space-y-4 text-sm text-gray-300">
                <div>
                  <span className="text-gray-400">Dirección:</span>{" "}
                  <span className="text-white">{oracleData.address ?? "N/A"}</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-gray-700/30 rounded-lg p-3">
                    <p className="text-xs text-gray-400">Ruido (dB)</p>
                    <p className="text-lg text-white font-semibold">
                      {oracleData.metrics?.noiseLevelDb ?? "N/A"}
                    </p>
                  </div>
                  <div className="bg-gray-700/30 rounded-lg p-3">
                    <p className="text-xs text-gray-400">Índice de seguridad</p>
                    <p className="text-lg text-white font-semibold">
                      {oracleData.metrics?.safetyIndex ?? "N/A"}
                    </p>
                  </div>
                  <div className="bg-gray-700/30 rounded-lg p-3">
                    <p className="text-xs text-gray-400">Obras</p>
                    <p className="text-lg text-white font-semibold">
                      {oracleData.metrics?.nearbyConstruction === undefined
                        ? "N/A"
                        : oracleData.metrics?.nearbyConstruction
                          ? "Sí"
                          : "No"}
                    </p>
                  </div>
                  <div className="bg-gray-700/30 rounded-lg p-3">
                    <p className="text-xs text-gray-400">Transporte</p>
                    <p className="text-lg text-white font-semibold">
                      {oracleData.metrics?.publicTransportStatus ?? "N/A"}
                    </p>
                  </div>
                </div>
                <p className="text-xs text-gray-500">
                  Fuente: {oracleBaseUrl}
                </p>
              </div>
            )}
            {!oracleLoading && !oracleError && !oracleData && (
              <p className="text-gray-400 text-sm">No hay datos del oráculo.</p>
            )}
          </div>

          <div className="bg-gray-800/50 backdrop-blur rounded-xl p-6 border border-gray-700">
            <h2 className="text-xl font-semibold text-white mb-4">
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
                  <span className="text-gray-400">Ubicación:</span>{" "}
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
                  <div className="bg-gray-700/30 rounded-lg p-3">
                    <p className="text-xs text-gray-400">Temperatura (°C)</p>
                    <p className="text-lg text-white font-semibold">
                      {weatherData.temperatureC ?? "N/A"}
                    </p>
                  </div>
                  <div className="bg-gray-700/30 rounded-lg p-3">
                    <p className="text-xs text-gray-400">Precipitación (mm)</p>
                    <p className="text-lg text-white font-semibold">
                      {weatherData.precipitationMm ?? "N/A"}
                    </p>
                  </div>
                  <div className="bg-gray-700/30 rounded-lg p-3">
                    <p className="text-xs text-gray-400">Viento (km/h)</p>
                    <p className="text-lg text-white font-semibold">
                      {weatherData.windSpeedKmh ?? "N/A"}
                    </p>
                  </div>
                </div>
                <p className="text-xs text-gray-500 break-all">
                  Fuente: {weatherData.sourceUrl}
                </p>
              </div>
            )}
            {!weatherLoading && !weatherError && !weatherData && (
              <p className="text-gray-400 text-sm">No hay datos de clima.</p>
            )}
          </div>

          {market.settled && (
             <div className="bg-gray-800/50 backdrop-blur rounded-xl p-6 border border-gray-700">
              <h2 className="text-xl font-semibold text-white mb-4">Resultado</h2>
              <div className="text-center py-4">
                 <p className="text-gray-400 mb-2">Veredicto</p>
                 <div className={`text-4xl font-bold ${market.outcome === 0 ? "text-green-500" : "text-red-500"}`}>
                   {market.outcome === 0 ? "SÍ (payout)" : "NO (sin reclamo)"}
                 </div>
                 <p className="text-sm text-gray-500 mt-2">
                   Confianza: {market.confidence / 100}%
                 </p>
                 <p className="text-xs text-gray-500 mt-1">
                   Si aportaste al resultado ganador, puedes reclamar.
                 </p>
              </div>
              <button
                onClick={handleClaim}
                disabled={isWritePending || isConfirming}
                className="w-full mt-4 bg-green-600 hover:bg-green-700 disabled:bg-gray-700 text-white font-bold py-3 rounded-xl transition"
              >
                Reclamar
              </button>
             </div>
          )}
        </div>


        {!market.settled && (
          <div className="bg-gray-800/50 backdrop-blur rounded-xl p-6 border border-gray-700 h-fit">
            <h2 className="text-xl font-semibold text-white mb-2">Aportar al pool</h2>
            <p className="text-xs text-gray-500 mb-6">
              En esta demo, aportar a <span className="text-green-400">SÍ</span> significa
              financiar el pool que paga cuando hay incumplimiento (payout). Aportar a{" "}
              <span className="text-red-400">NO</span> significa financiar el pool de “sin reclamo”.
            </p>
            
            {!isConnected && !isTest ? (
              <div className="text-center py-8">
                <p className="text-gray-400 mb-4">Conecta tu wallet para aportar</p>
                <ConnectKitButton />
              </div>
            ) : (
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <button
                    onClick={() => setSelectedOutcome(0)}
                    className={`p-4 rounded-xl border-2 transition text-lg font-bold ${
                      selectedOutcome === 0
                        ? "border-green-500 bg-green-500/20 text-green-400"
                        : "border-gray-700 hover:border-green-500/50 text-gray-400"
                    }`}
                  >
                    SÍ (payout)
                  </button>
                  <button
                    onClick={() => setSelectedOutcome(1)}
                    className={`p-4 rounded-xl border-2 transition text-lg font-bold ${
                      selectedOutcome === 1
                        ? "border-red-500 bg-red-500/20 text-red-400"
                        : "border-gray-700 hover:border-red-500/50 text-gray-400"
                    }`}
                  >
                    NO (sin reclamo)
                  </button>
                </div>

                <div>
                  <label className="block text-sm text-gray-400 mb-2">
                    Cantidad (ETH)
                  </label>
                  <input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.01"
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white focus:outline-none focus:border-purple-500 transition"
                    min="0"
                    step="0.001"
                  />
                </div>

                {writeError && (
                  <div className="text-red-400 text-sm bg-red-900/20 p-3 rounded-lg">
                    {writeError.message.split("\n")[0]}
                  </div>
                )}

                {isSuccess && !isConfirming && (
                   <div className="text-green-400 text-sm bg-green-900/20 p-3 rounded-lg">
                     ¡Transacción confirmada!
                   </div>
                 )}

                <button
                  onClick={handlePredict}
                  disabled={!amount || selectedOutcome === null || isWritePending || isConfirming}
                  className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-bold py-4 rounded-xl transition"
                >
                  {isWritePending || isConfirming ? "Procesando..." : "Enviar aporte"}
                </button>

                 {/* AI Settlement Button */}
                 <div className="pt-6 border-t border-gray-700 mt-6">
                   <h3 className="text-sm font-semibold text-gray-300 mb-3">Liquidación</h3>
                   <button
                     onClick={handleRequestSettlement}
                     disabled={isWritePending || isConfirming}
                     className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 text-white font-bold py-3 rounded-xl transition flex items-center justify-center gap-2"
                     data-testid="ai-settlement-button"
                   >
                     <span>🤖</span> Solicitar liquidación de IA
                   </button>                    {(hash || testHash) && (
                      <div className="mt-2 text-xs bg-black/40 p-2 rounded border border-blue-500/30 text-blue-200 break-all">
                        <p className="font-bold text-blue-400 mb-1">TX Hash (Copia este!):</p>
                        {hash || testHash}
                      </div>
                    )}                   <p className="text-xs text-gray-500 mt-2 text-center">
                     Esto activa el workflow de CRE + Gemini para resolver la póliza.
                   </p>
                 </div>
              </div>
            )}
            
            {/* Admin Tool for Forcing Settlement (Only visible to Owner) */}
            {isOwner && (
               <div className="mt-8 pt-6 border-t border-gray-700">
                  <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4">
                    ⚠️ Zona admin (testing)
                  </h3>
                  <div className="space-y-2">
                    <p className="text-xs text-gray-500 mb-2">
                      Forzar liquidación para pruebas.
                      <br/>Paso 1: poner Forwarder en tu wallet.
                      <br/>Paso 2: enviar reporte de liquidación.
                      <br/>Paso 3: restaurar Forwarder real.
                    </p>
                    <button 
                      onClick={() => handleSettleMarket(0)}
                      className="text-xs bg-blue-900 text-blue-200 px-2 py-1 rounded w-full mb-2"
                    >
                      Paso 1: Ponerme como Forwarder
                    </button>
                    <div className="flex gap-2">
                        <button 
                        onClick={() => handleForceSettleStep2(0)}
                        className="flex-1 text-xs bg-green-900 text-green-200 px-2 py-1 rounded"
                        >
                        Paso 2: Liquidar SÍ
                        </button>
                        <button 
                        onClick={() => handleForceSettleStep2(1)}
                        className="flex-1 text-xs bg-red-900 text-red-200 px-2 py-1 rounded"
                        >
                        Paso 2: Liquidar NO
                        </button>
                    </div>
                    <button 
                      onClick={handleRestoreForwarder}
                      className="text-xs bg-gray-700 text-gray-300 px-2 py-1 rounded w-full mt-2"
                    >
                      Paso 3: Restaurar Forwarder real
                    </button>
                  </div>
               </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
