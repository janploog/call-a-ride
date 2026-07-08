import type { ExpoConfig } from "expo/config";

/**
 * Dynamische App-Konfiguration. APP_VARIANT kommt aus dem EAS-Build-Profil
 * (eas.json) bzw. ist lokal "development" — so sind Dev-, Beta- und
 * Store-App parallel installierbar und klar unterscheidbar.
 */
type Variant = "development" | "preview" | "production";

const variant: Variant = (["development", "preview", "production"] as const).includes(
  process.env.APP_VARIANT as Variant,
)
  ? (process.env.APP_VARIANT as Variant)
  : "development";

const BUNDLE_IDS: Record<Variant, string> = {
  development: "com.callaride.driver.dev",
  preview: "com.callaride.driver.preview",
  production: "com.callaride.driver",
};

const NAMES: Record<Variant, string> = {
  development: "CaR Fahrer (Dev)",
  preview: "CaR Fahrer (Beta)",
  production: "Call-a-Ride Fahrer",
};

const config: ExpoConfig = {
  name: NAMES[variant],
  slug: "call-a-ride-driver",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/icon.png",
  userInterfaceStyle: "light",
  scheme: "callaridedriver",
  ios: {
    supportsTablet: false,
    bundleIdentifier: BUNDLE_IDS[variant],
  },
  android: {
    package: BUNDLE_IDS[variant],
    adaptiveIcon: {
      backgroundColor: "#E6F4FE",
      foregroundImage: "./assets/android-icon-foreground.png",
      backgroundImage: "./assets/android-icon-background.png",
      monochromeImage: "./assets/android-icon-monochrome.png",
    },
    predictiveBackGestureEnabled: false,
  },
  web: {
    favicon: "./assets/favicon.png",
  },
  plugins: [
    "expo-router",
    [
      "expo-location",
      {
        locationWhenInUsePermission:
          "Call-a-Ride Fahrer übermittelt deine Position, damit dir passende Fahrten zugewiesen werden und Fahrgäste deine Anfahrt verfolgen können.",
      },
    ],
    "expo-notifications",
    "expo-dev-client",
  ],
  extra: {
    eas: {
      projectId: process.env.EAS_PROJECT_ID,
    },
  },
};

export default config;
