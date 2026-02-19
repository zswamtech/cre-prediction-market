import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { Navbar } from "@/components/layout/Navbar";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "FairLease - Seguro Parametrico de Experiencias",
  description: "Proteccion automatica para tu vuelo y tu estadia con Chainlink CRE + IA",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body className={inter.className} data-test-mode={process.env.NEXT_PUBLIC_TEST_MODE || '0'}>
        <Providers>
          <Navbar />
          <main className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 pt-16">
            {children}
          </main>
        </Providers>
      </body>
    </html>
  );
}
