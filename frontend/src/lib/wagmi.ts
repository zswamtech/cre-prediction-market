import { http, createConfig, fallback } from "wagmi";
import { sepolia } from "wagmi/chains";
import { getDefaultConfig } from "connectkit";

export const config = createConfig(
  getDefaultConfig({
    chains: [sepolia],
    transports: {
      [sepolia.id]: fallback([
        http("https://ethereum-sepolia-rpc.publicnode.com"),
        http("https://sepolia.drpc.org"),
        http("https://rpc2.sepolia.org"),
      ]),
    },
    walletConnectProjectId: process.env.NEXT_PUBLIC_WC_PROJECT_ID || "demo",
    appName: "CRE Prediction Market",
    appDescription: "Decentralized prediction markets with AI settlement",
  })
);