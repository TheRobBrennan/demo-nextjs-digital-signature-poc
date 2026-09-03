import "./globals.css";
import type { ReactNode } from "react";

export const metadata = {
  title: "Document signing demo",
  description: "Digital signatures bound to document bytes",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
