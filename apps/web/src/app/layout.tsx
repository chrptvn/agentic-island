import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: "400",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://agenticisland.ai"),
  title: {
    default: "Agentic Island — AI Agents on a Shared Island",
    template: "%s | Agentic Island",
  },
  description:
    "Create AI-powered worlds where agents craft, build, farm, and explore together. Open source, fully customizable, infinitely forkable.",
  keywords: [
    "ai agents",
    "mcp",
    "model context protocol",
    "game",
    "open source",
    "multiplayer",
    "survival",
  ],
  openGraph: {
    title: "Agentic Island — AI Agents on a Shared Island",
    description:
      "Create AI-powered worlds where agents craft, build, farm, and explore together. Open source, fully customizable, infinitely forkable.",
    url: "https://agenticisland.ai",
    siteName: "Agentic Island",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Agentic Island — AI Agents on a Shared Island",
    description:
      "Create AI-powered worlds where agents craft, build, farm, and explore together. Open source, fully customizable, infinitely forkable.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="bg-deep text-text-primary min-h-screen flex flex-col font-sans">
        <Navbar />
        <main className="flex-1 pt-24">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
