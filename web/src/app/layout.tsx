import type { Metadata, Viewport } from "next";
import { Golos_Text, IBM_Plex_Sans, JetBrains_Mono } from "next/font/google";
import { PostHogProvider } from "@/lib/analytics/PostHogProvider";
import "./globals.css";

// Cobalt's display face (Familjen Grotesk) has no Cyrillic subset and every
// headline here is Russian — Golos Text substitutes it (waive 37): same
// weight-600 grotesk voice, built for Cyrillic.
const golosText = Golos_Text({
  variable: "--font-golos",
  subsets: ["cyrillic", "latin"],
  weight: ["500", "600"],
  display: "swap",
});
const ibmPlexSans = IBM_Plex_Sans({
  variable: "--font-plex",
  subsets: ["cyrillic", "latin"],
  weight: ["400", "500"],
  display: "swap",
});
const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jbmono",
  subsets: ["cyrillic", "latin"],
  weight: ["400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Бот, который отвечает вместо вас — по истории чата",
  description:
    "Подключите бота к чату — он отвечает на вопросы по истории переписки, с цитатой и датой исходного сообщения. Бесплатно на пилоте.",
};

export const viewport: Viewport = {
  themeColor: "#f7f8fb",
  colorScheme: "light",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="ru"
      className={`${golosText.variable} ${ibmPlexSans.variable} ${jetbrainsMono.variable}`}
    >
      <body>
        <PostHogProvider>{children}</PostHogProvider>
      </body>
    </html>
  );
}
