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
  development: "com.callaride.rider.dev",
  preview: "com.callaride.rider.preview",
  production: "com.callaride.rider",
};

const NAMES: Record<Variant, string> = {
  development: "Call-a-Ride (Dev)",
  preview: "Call-a-Ride (Beta)",
  production: "Call-a-Ride",
};

const config: ExpoConfig = {
  name: NAMES[variant],
  slug: "call-a-ride-rider",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/icon.png",
  userInterfaceStyle: "light",
  scheme: "callaride",
  ios: {
    supportsTablet: true,
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
    "@maplibre/maplibre-react-native",
    [
      "expo-location",
      {
        locationWhenInUsePermission:
          "Call-a-Ride nutzt deinen Standort, um Abholort und Fahrtroute zu bestimmen.",
      },
    ],
    [
      "@stripe/stripe-react-native",
      {
        merchantIdentifier: "merchant.com.callaride",
        enableGooglePay: true,
      },
    ],
    "expo-notifications",
    "expo-dev-client",
  ],
  extra: {
    eas: {
      // Nach `eas init` in eas.json (env) bzw. lokal in .env setzen —
      // ohne ID überspringt die App die Push-Registrierung
      projectId: process.env.EAS_PROJECT_ID,
    },
  },
};

export default config;
