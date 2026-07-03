import "react-native-get-random-values";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { configureAmplify } from "../src/lib/amplify";

configureAmplify();

export default function RootLayout() {
  return (
    <>
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
        <Stack.Screen name="home" options={{ title: "Call-a-Ride Fahrer" }} />
        <Stack.Screen name="ride/[rideId]" options={{ title: "Aktive Fahrt" }} />
        <Stack.Screen name="earnings" options={{ title: "Verdienst" }} />
        <Stack.Screen name="documents" options={{ title: "Dokumente" }} />
      </Stack>
    </>
  );
}
