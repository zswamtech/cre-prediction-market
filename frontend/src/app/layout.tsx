import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "CRE Prediction Market",
  description: "Decentralized prediction markets with AI-powered settlement",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <Providers>
          <main className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900">
            {children}
          </main>
        </Providers>
      </body>
    </html>
  );
}
