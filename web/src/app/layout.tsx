import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { resolveSiteUrl } from "@/lib/site-url";
import { AppProvider } from "@/lib/app-context";
import { Toaster } from "@/components/ui/toaster";
import { AmplitudeProvider } from "@/components/AmplitudeProvider";
import { UpdateBanner } from "@/components/UpdateBanner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  // Turns the relative /og-image.png below into an absolute URL. Required —
  // iMessage, Slack, and Twitter/X will not resolve a relative og:image.
  metadataBase: new URL(resolveSiteUrl()),
  title: "OpenRecord - Manage your Health Data with AI",
  description:
    "Connect your MyChart portal to Claude AI. Manage health records, send messages, book appointments, request refills, and more — all with AI.",
  applicationName: "OpenRecord",
  manifest: "/manifest.webmanifest",

  openGraph: {
    title: "OpenRecord - Manage your Health Data with AI",
    description:
      "Connect your MyChart portal to Claude AI. Manage health records, send messages, book appointments, request refills, and more — all with AI.",
    siteName: "OpenRecord",
    url: "/",
    locale: "en_US",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "OpenRecord — connect Claude to your MyChart portal",
        type: "image/png",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "OpenRecord - Manage your Health Data with AI",
    description:
      "Connect your MyChart portal to Claude AI. Manage health records, send messages, book appointments, request refills, and more — all with AI.",
    images: ["/og-image.png"],
  },
  icons: {
    // favicon.ico is picked up automatically from app/favicon.ico — listing it
    // here too would emit a duplicate <link rel="icon">.
    icon: [{ url: "/icon.svg", type: "image/svg+xml", sizes: "any" }],
    apple: { url: "/apple-touch-icon.png", sizes: "180x180" },
  },
  appleWebApp: {
    title: "OpenRecord",
    capable: true,
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: "#f7f9fc",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <AppProvider>
          <AmplitudeProvider />
          <UpdateBanner />
          {children}
          <Toaster />
        </AppProvider>
      </body>
    </html>
  );
}
