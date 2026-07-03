import { estimateFareCents } from "@call-a-ride/core";
import { fetchAuthSession, getCurrentUser, signOut } from "aws-amplify/auth";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { config } from "../src/config";
import { styles } from "../src/ui";

/**
 * Walking-Skeleton-Screen: beweist alle Pfade des Durchstichs —
 * Login-Session (Cognito), REST-API (health), WebSocket-Echo und die
 * geteilte Preislogik aus @call-a-ride/core.
 */
export default function Home() {
  const router = useRouter();
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [healthResult, setHealthResult] = useState<string | null>(null);
  const [echoResult, setEchoResult] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  // Beispiel: 5 km, 12 min — gerechnet mit derselben Logik wie im Backend
  const exampleFare = (estimateFareCents(5000, 720) / 100).toFixed(2);

  useEffect(() => {
    getCurrentUser()
      .then((u) => setUserEmail(u.signInDetails?.loginId ?? u.username))
      .catch(() => router.replace("/sign-in"));
    return () => wsRef.current?.close();
  }, [router]);

  async function onHealthCheck() {
    setHealthResult("…");
    try {
      const res = await fetch(`${config.apiUrl}/health`);
      setHealthResult(`${res.status}: ${await res.text()}`);
    } catch (e) {
      setHealthResult(e instanceof Error ? e.message : "Fehler");
    }
  }

  async function onEchoTest() {
    setEchoResult("verbinde…");
    try {
      const { userSub } = await fetchAuthSession();
      const ws = new WebSocket(`${config.wsUrl}?userId=${userSub ?? "unknown"}`);
      wsRef.current = ws;
      ws.onopen = () => {
        setEchoResult("verbunden, sende…");
        ws.send(JSON.stringify({ hello: "call-a-ride" }));
      };
      ws.onmessage = (event) => {
        setEchoResult(`Echo: ${String(event.data)}`);
        ws.close();
      };
      ws.onerror = () => setEchoResult("WebSocket-Fehler");
    } catch (e) {
      setEchoResult(e instanceof Error ? e.message : "Fehler");
    }
  }

  async function onSignOut() {
    await signOut();
    router.replace("/sign-in");
  }

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Hallo!</Text>
      <Text style={styles.subtitle}>Angemeldet als {userEmail ?? "…"}</Text>

      <Text style={styles.subtitle}>
        Beispiel-Preisschätzung (5 km, 12 min): {exampleFare} € — berechnet mit der
        geteilten Preislogik aus @call-a-ride/core.
      </Text>

      <Pressable style={styles.button} onPress={onHealthCheck}>
        <Text style={styles.buttonText}>API-Health testen</Text>
      </Pressable>
      {healthResult ? <Text style={styles.successText}>{healthResult}</Text> : null}

      <Pressable style={styles.button} onPress={onEchoTest}>
        <Text style={styles.buttonText}>WebSocket-Echo testen</Text>
      </Pressable>
      {echoResult ? <Text style={styles.successText}>{echoResult}</Text> : null}

      <Pressable onPress={onSignOut}>
        <Text style={styles.linkText}>Abmelden</Text>
      </Pressable>
    </View>
  );
}
