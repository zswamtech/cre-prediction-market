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
  // Expose TEST_MODE for E2E to ensure certain UI always renders
  const isTest = process.env.NEXT_PUBLIC_TEST_MODE === '1';
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className} data-test-mode={process.env.NEXT_PUBLIC_TEST_MODE || '0'}>
        <Providers>
          <main className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900">
            {children}
          </main>
        </Providers>
      </body>
    </html>
  );
}
