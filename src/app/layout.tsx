import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DISA — Inventario",
  description: "Sistema de gestión de inventario para DISA telas",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className="h-full">
      <body className="h-full">{children}</body>
    </html>
  );
}
