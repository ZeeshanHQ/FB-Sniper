import type { Metadata } from "next";
import { Inter, Bricolage_Grotesque } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const bricolage = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-bricolage" });

export const metadata: Metadata = {
  title: "Astraventa FB Sniper",
  description: "Elite multi-tenant Facebook automation platform",
  viewport: "width=device-width, initial-scale=1, maximum-scale=5, user-scalable=yes",
  icons: {
    icon: "/favicon.png",
    shortcut: "/favicon.png",
    apple: "/favicon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`h-full ${inter.variable} ${bricolage.variable}`} suppressHydrationWarning>
      <body className="min-h-full antialiased font-sans bg-gray-50 text-gray-900">
        {children}
      </body>
    </html>
  );
}
