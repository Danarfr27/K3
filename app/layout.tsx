import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "K3 AI — Cyber Intelligence Assistant",
  description:
    "K3 AI is a serverless cyber-intelligence chatbot: streaming chat, memory, file analysis and image synthesis in a modern hacker-terminal interface.",
};

export const viewport: Viewport = {
  themeColor: "#050505",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark">
      <body className="scanlines grid-bg antialiased">
        <div className="scan-beam" aria-hidden="true" />
        {children}
      </body>
    </html>
  );
}
