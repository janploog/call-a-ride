import "react-native-get-random-values";
import { StripeProvider } from "@stripe/stripe-react-native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { config } from "../src/config";
import { configureAmplify } from "../src/lib/amplify";

configureAmplify();

export default function RootLayout() {
  return (
    <StripeProvider
      publishableKey={config.stripePublishableKey}
      merchantIdentifier="merchant.com.callaride"
    >
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerShadowVisible: false,
          headerTitleStyle: { fontWeight: "600" },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="sign-in" options={{ title: "Anmelden" }} />
        <Stack.Screen name="sign-up" options={{ title: "Registrieren" }} />
        <Stack.Screen name="confirm" options={{ title: "E-Mail bestätigen" }} />
        <Stack.Screen name="home" options={{ title: "Call-a-Ride" }} />
        <Stack.Screen name="ride/[rideId]" options={{ title: "Fahrt" }} />
        <Stack.Screen name="payment-setup" options={{ title: "Zahlungsmittel" }} />
        <Stack.Screen name="history" options={{ title: "Meine Fahrten" }} />
      </Stack>
    </StripeProvider>
  );
}
