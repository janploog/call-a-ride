import type { ServerMessage } from "@call-a-ride/core";
import { getCurrentUser, signOut } from "aws-amplify/auth";
import * as Location from "expo-location";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Pressable, Switch, Text, View } from "react-native";
import { respondToOffer } from "../src/lib/api";
import { openDriverSocket, type DriverSocket } from "../src/lib/ws";
import { colors, styles } from "../src/ui";

type RideOffer = Extract<ServerMessage, { type: "rideOffer" }>;

export default function DriverHome() {
  const router = useRouter();
  const [online, setOnline] = useState(false);
  const [offer, setOffer] = useState<RideOffer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<DriverSocket | null>(null);
  const watcherRef = useRef<Location.LocationSubscription | null>(null);

  useEffect(() => {
    getCurrentUser().catch(() => router.replace("/sign-in"));
    return () => goOffline();
  }, [router]);

  function goOffline() {
    watcherRef.current?.remove();
    watcherRef.current = null;
    socketRef.current?.close();
    socketRef.current = null;
  }

  async function toggleOnline(next: boolean) {
    setError(null);
    if (!next) {
      setOnline(false);
      goOffline();
      return;
    }
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setError("Ohne Standortfreigabe kannst du nicht online gehen.");
        return;
      }
      const socket = await openDriverSocket((message) => {
        if (message.type === "rideOffer") setOffer(message);
      });
      socketRef.current = socket;
      watcherRef.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: 5000,
          distanceInterval: 25,
        },
        (pos) => {
          socket.sendLocation({
            position: { lat: pos.coords.latitude, lon: pos.coords.longitude },
            available: true,
          });
        },
      );
      setOnline(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Verbindung fehlgeschlagen");
      goOffline();
    }
  }

  async function onRespond(accept: boolean) {
    if (!offer) return;
    const rideId = offer.rideId;
    setOffer(null);
    try {
      await respondToOffer(rideId, accept);
      if (accept) {
        setOnline(false);
        goOffline();
        router.push({ pathname: "/ride/[rideId]", params: { rideId } });
      }
    } catch (e) {
      // Typischer Fall: Angebot in der Zwischenzeit abgelaufen (409)
      setError(e instanceof Error ? e.message : "Antwort fehlgeschlagen");
    }
  }

  async function onSignOut() {
    goOffline();
    await signOut();
    router.replace("/sign-in");
  }

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>{online ? "Du bist online" : "Du bist offline"}</Text>
      <Text style={styles.subtitle}>
        {online
          ? "Deine Position wird übermittelt – Fahrtanfragen erscheinen hier."
          : "Gehe online, um Fahrtanfragen zu erhalten."}
      </Text>

      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <Switch value={online} onValueChange={toggleOnline} />
        <Text style={{ fontSize: 16, color: colors.text }}>Fahrbereit</Text>
      </View>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      {offer ? (
        <View
          style={{
            borderWidth: 2,
            borderColor: colors.primary,
            borderRadius: 12,
            padding: 16,
            gap: 8,
          }}
        >
          <Text style={[styles.title, { fontSize: 20, marginBottom: 0 }]}>
            Neue Fahrtanfrage
          </Text>
          <Text style={styles.subtitle}>
            Von: {offer.pickupAddress}
            {"\n"}Nach: {offer.dropoffAddress}
            {"\n"}
            {(offer.distanceMeters / 1000).toFixed(1)} km ·{" "}
            {(offer.estimatedFareCents / 100).toFixed(2)} €
          </Text>
          <Pressable style={styles.button} onPress={() => onRespond(true)}>
            <Text style={styles.buttonText}>Annehmen</Text>
          </Pressable>
          <Pressable onPress={() => onRespond(false)}>
            <Text style={[styles.linkText, { color: colors.error }]}>Ablehnen</Text>
          </Pressable>
        </View>
      ) : null}

      <Pressable onPress={onSignOut}>
        <Text style={styles.linkText}>Abmelden</Text>
      </Pressable>
    </View>
  );
}
