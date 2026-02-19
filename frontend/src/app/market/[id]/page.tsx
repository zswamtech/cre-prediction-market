"use client";

import { useAccount, useReadContract } from "wagmi";
import { encodeAbiParameters, concat } from "viem";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  PREDICTION_MARKET_ADDRESS,
  PREDICTION_MARKET_ABI,
} from "@/lib/contract";
import { useReliableWrite } from "@/hooks/useReliableWrite";
import { Badge } from "@/components/ui/Badge";
import { DecisionPanel, type FlightOracleData } from "@/components/market/DecisionPanel";
import { PredictForm } from "@/components/market/PredictForm";

const SEP_CHAINLINK_FORWARDER = "0x15fc6ae953e024d975e77382eeec56a9101f9f88";
const FLIGHT_ORACLE_BASE_URL =
  process.env.NEXT_PUBLIC_FLIGHT_ORACLE_BASE_URL || "http://127.0.0.1:3101";
const FLIGHT_KEYWORDS_RE = /\b(vuelo|flight|delay|retras[oa]s?|cancelad[oa]|cancelled)\b/i;
const FLIGHT_ID_RE = /\b([A-Z]{2}\d{3,5})\b/;

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
  const { isConnected, address: userAddress } = useAccount();
  const isTest = process.env.NEXT_PUBLIC_TEST_MODE === "1";
  const oracleBaseUrl =
    process.env.NEXT_PUBLIC_ORACLE_BASE_URL || "http://127.0.0.1:3001";
  const weatherLatitude = parseFloat(process.env.NEXT_PUBLIC_WEATHER_LAT || "6.2442");
  const weatherLongitude = parseFloat(process.env.NEXT_PUBLIC_WEATHER_LON || "-75.5812");
  const weatherTimezone = process.env.NEXT_PUBLIC_WEATHER_TIMEZONE || "America/Bogota";

  const [testHash, setTestHash] = useState<string | null>(null);
  const [oracleData, setOracleData] = useState<OracleMetrics | null>(null);
  const [oracleLoading, setOracleLoading] = useState(false);
  const [oracleError, setOracleError] = useState<string | null>(null);
  const [weatherData, setWeatherData] = useState<WeatherMetrics | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [weatherError, setWeatherError] = useState<string | null>(null);
  const [flightData, setFlightData] = useState<FlightOracleData | null>(null);
  const [flightLoading, setFlightLoading] = useState(false);
  const [flightError, setFlightError] = useState<string | null>(null);
  const [showAdmin, setShowAdmin] = useState(false);

  const marketId = id ? BigInt(Array.isArray(id) ? id[0] : id) : undefined;

  const { data: marketResult, isLoading, refetch } = useReadContract({
    address: PREDICTION_MARKET_ADDRESS,
    abi: PREDICTION_MARKET_ABI,
    functionName: "getMarket",
    args: marketId !== undefined ? [marketId] : undefined,
    query: {
      enabled: marketId !== undefined,
      gcTime: 0,
      staleTime: 0,
    },
  });

  const oracleZoneId =
    (marketResult as any)?.question?.match(/(?:propiedad|property)\s*id\s*(\d+)/i)?.[1] ??
    (marketId !== undefined ? marketId.toString() : undefined);

  const { writeContract, hash, isPending: isWritePending, isConfirming, isSuccess, error: writeError } = useReliableWrite();

  // Auto-refresh (silent)
  useEffect(() => {
    const interval = setInterval(() => refetch(), 5000);
    return () => clearInterval(interval);
  }, [refetch]);

  // Oracle fetch
  useEffect(() => {
    if (!oracleZoneId) return;
    let cancelled = false;
    const baseUrl = oracleBaseUrl.replace(/\/+$/, "");

    const fetchOracle = async () => {
      setOracleLoading(true);
      setOracleError(null);
      try {
        const response = await fetch(`${baseUrl}/api/market/${oracleZoneId}`);
        if (!response.ok) throw new Error(`Oracle responded with ${response.status}`);
        const json = await response.json();
        if (!json?.success) throw new Error(json?.error || "Oracle response invalid");
        if (!cancelled) setOracleData(json.data ?? null);
      } catch (error) {
        if (!cancelled) {
          setOracleData(null);
          setOracleError(error instanceof Error ? error.message : "Oracle error");
        }
      } finally {
        if (!cancelled) setOracleLoading(false);
      }
    };

    fetchOracle();
    const interval = setInterval(fetchOracle, 15000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [oracleZoneId, oracleBaseUrl]);

  // Detect flight policy from question text
  const questionText = (marketResult as any)?.question ?? "";
  const isFlightPolicy = FLIGHT_KEYWORDS_RE.test(questionText);
  const extractedFlightId = questionText.match(FLIGHT_ID_RE)?.[1] ?? null;

  // Flight oracle fetch (only for flight policies)
  useEffect(() => {
    if (!isFlightPolicy || !extractedFlightId) return;
    let cancelled = false;
    const baseUrl = FLIGHT_ORACLE_BASE_URL.replace(/\/+$/, "");

    const fetchFlight = async () => {
      setFlightLoading(true);
      setFlightError(null);
      try {
        const response = await fetch(`${baseUrl}/api/flight-delay/${extractedFlightId}`);
        if (!response.ok) throw new Error(`Flight oracle responded with ${response.status}`);
        const json = await response.json();
        if (!json?.success) throw new Error(json?.error || "Flight oracle response invalid");
        if (!cancelled) setFlightData(json.data ?? null);
      } catch (error) {
        if (!cancelled) {
          setFlightData(null);
          setFlightError(error instanceof Error ? error.message : "Flight oracle error");
        }
      } finally {
        if (!cancelled) setFlightLoading(false);
      }
    };

    fetchFlight();
    const interval = setInterval(fetchFlight, 30000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [isFlightPolicy, extractedFlightId]);

  // Weather fetch
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
        if (!response.ok) throw new Error(`Weather responded with ${response.status}`);
        const json = await response.json();
        const current = json?.current;
        if (!current) throw new Error("Weather response invalid");
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
        if (!cancelled) setWeatherLoading(false);
      }
    };

    fetchWeather();
    const interval = setInterval(fetchWeather, 15 * 60 * 1000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [weatherLatitude, weatherLongitude, weatherTimezone]);

  // Reset form on success
  useEffect(() => {
    if (isSuccess) refetch();
  }, [isSuccess, refetch]);

  // Owner check for admin
  const { data: ownerAddress } = useReadContract({
    address: PREDICTION_MARKET_ADDRESS,
    abi: PREDICTION_MARKET_ABI,
    functionName: "owner",
  });
  const isOwner = isConnected && ownerAddress && userAddress === ownerAddress;

  // Admin handlers
  const handleSettleMarket = async () => {
    if (!marketId || !isOwner) return;
    writeContract({
      address: PREDICTION_MARKET_ADDRESS,
      abi: PREDICTION_MARKET_ABI,
      functionName: "setForwarderAddress",
      args: [userAddress!],
    });
  };

  const handleForceSettleStep2 = (outcome: 0 | 1) => {
    if (!marketId) return;
    const reportData = encodeAbiParameters(
      [{ type: "uint256" }, { type: "uint8" }, { type: "uint16" }],
      [marketId, outcome, 10000]
    );
    const fullReport = concat(["0x01", reportData]);
    writeContract({
      address: PREDICTION_MARKET_ADDRESS,
      abi: PREDICTION_MARKET_ABI,
      functionName: "onReport",
      args: ["0x", fullReport],
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

  const handlePredict = (outcome: 0 | 1, value: bigint) => {
    if (marketId === undefined) return;
    writeContract({
      address: PREDICTION_MARKET_ADDRESS,
      abi: PREDICTION_MARKET_ABI,
      functionName: "predict",
      args: [marketId, outcome],
      value,
    });
  };

  const handleRequestSettlement = () => {
    if (!marketId) return;
    if (isTest) {
      setTestHash("0x" + "e2e".padEnd(8, "0") + "cafebabedeadbeef".padEnd(56, "0"));
      return;
    }
    writeContract({
      address: PREDICTION_MARKET_ADDRESS,
      abi: PREDICTION_MARKET_ABI,
      functionName: "requestSettlement",
      args: [marketId],
    });
  };

  if (!marketId) return <div className="p-8 text-center text-gray-400">ID de poliza invalido</div>;
  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-gray-800/50 rounded w-1/3" />
          <div className="h-12 bg-gray-800/50 rounded w-2/3" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-4">
              <div className="h-48 bg-gray-800/50 rounded-xl" />
              <div className="h-48 bg-gray-800/50 rounded-xl" />
            </div>
            <div className="h-96 bg-gray-800/50 rounded-xl" />
          </div>
        </div>
      </div>
    );
  }
  if (!marketResult) return <div className="p-8 text-center text-red-400">Poliza no encontrada</div>;

  const market = marketResult;

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      {/* Header */}
      <div className="mb-8">
        <Link
          href="/"
          className="text-gray-400 hover:text-white transition flex items-center gap-2 mb-4 text-sm"
        >
          ← Volver a polizas
        </Link>
        <div className="flex items-center gap-3 mb-3 flex-wrap">
          <Badge variant="info">Poliza #{marketId.toString()}</Badge>
          <Badge variant={isFlightPolicy ? "flight" : "property"}>
            {isFlightPolicy ? "✈️ Vuelo" : "🏠 Inmueble"}
          </Badge>
          {market.settled ? (
            <Badge variant="settled">Resuelta</Badge>
          ) : (
            <Badge variant="active">Activa</Badge>
          )}
          {isFlightPolicy && extractedFlightId && (
            <Badge variant="info">{extractedFlightId}</Badge>
          )}
        </div>
        <h1 className="text-2xl md:text-3xl font-bold text-white">
          {market.question}
        </h1>
      </div>

      {/* Main content */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Left: Evidence & Result */}
        <DecisionPanel
          market={market}
          isFlightPolicy={isFlightPolicy}
          flightData={flightData}
          flightLoading={flightLoading}
          flightError={flightError}
          oracleData={oracleData}
          oracleLoading={oracleLoading}
          oracleError={oracleError}
          oracleBaseUrl={oracleBaseUrl}
          weatherData={weatherData}
          weatherLoading={weatherLoading}
          weatherError={weatherError}
          weatherLatitude={weatherLatitude}
          weatherLongitude={weatherLongitude}
          weatherTimezone={weatherTimezone}
          onClaim={handleClaim}
          isProcessing={isWritePending || isConfirming}
        />

        {/* Right: Predict form (only when not settled) */}
        {!market.settled && (
          <PredictForm
            isConnected={isConnected}
            isTest={isTest}
            marketId={marketId}
            onPredict={handlePredict}
            onRequestSettlement={handleRequestSettlement}
            isProcessing={isWritePending}
            isConfirming={isConfirming}
            isSuccess={isSuccess}
            writeError={writeError}
            txHash={(hash || testHash) ?? null}
          />
        )}
      </div>

      {/* Admin zone - hidden by default, toggle via button */}
      {isOwner && (
        <div className="mt-12">
          <button
            onClick={() => setShowAdmin(!showAdmin)}
            className="text-xs text-gray-600 hover:text-gray-400 transition"
          >
            {showAdmin ? "Ocultar admin" : "Mostrar herramientas admin"}
          </button>
          {showAdmin && (
            <div className="mt-4 bg-gray-900/50 border border-gray-800 rounded-xl p-6">
              <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4">
                Zona admin (testing)
              </h3>
              <div className="space-y-2">
                <p className="text-xs text-gray-500 mb-2">
                  Forzar liquidacion para pruebas.
                </p>
                <button
                  onClick={handleSettleMarket}
                  className="text-xs bg-blue-900 text-blue-200 px-3 py-2 rounded w-full"
                >
                  Paso 1: Ponerme como Forwarder
                </button>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleForceSettleStep2(0)}
                    className="flex-1 text-xs bg-green-900 text-green-200 px-3 py-2 rounded"
                  >
                    Paso 2: Liquidar SI
                  </button>
                  <button
                    onClick={() => handleForceSettleStep2(1)}
                    className="flex-1 text-xs bg-red-900 text-red-200 px-3 py-2 rounded"
                  >
                    Paso 2: Liquidar NO
                  </button>
                </div>
                <button
                  onClick={handleRestoreForwarder}
                  className="text-xs bg-gray-700 text-gray-300 px-3 py-2 rounded w-full mt-2"
                >
                  Paso 3: Restaurar Forwarder real
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
