import { http, createConfig, fallback } from "wagmi";
import { sepolia } from "wagmi/chains";
import { getDefaultConfig } from "connectkit";

const rpcOptions = {
  retryCount: 3,
  retryDelay: 1000,
  timeout: 30_000,
};

export const config = createConfig(
  getDefaultConfig({
    chains: [sepolia],
    transports: {
      [sepolia.id]: fallback(
        [
          http("https://sepolia.gateway.tenderly.co", rpcOptions),
          http("https://ethereum-sepolia-rpc.publicnode.com", rpcOptions),
          http("https://sepolia.drpc.org", rpcOptions),
          http("https://1rpc.io/sepolia", rpcOptions),
        ],
        { rank: true }
      ),
    },
    walletConnectProjectId: process.env.NEXT_PUBLIC_WC_PROJECT_ID || "demo",
    appName: "FairLease",
    appDescription: "Seguro parametrico de experiencias con Chainlink CRE",
  })
);