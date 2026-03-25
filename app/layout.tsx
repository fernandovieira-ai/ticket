import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const plusJakartaSans = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "DigitalRF Help — Sistema de Tickets",
  description: "Sistema de suporte e gerenciamento de chamados",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body
        className={`${plusJakartaSans.variable} antialiased`}
        style={{ fontFamily: "var(--font-primary)" }}
      >
        {children}
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
