import type { ServerMessage } from "@call-a-ride/core";
import { getCurrentUser, signOut } from "aws-amplify/auth";
import * as Location from "expo-location";
import { Link, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Linking, Pressable, Switch, Text, View } from "react-native";
import {
  getDriverProfile,
  respondToOffer,
  startStripeOnboarding,
  submitPushToken,
  type DriverProfile,
} from "../src/lib/api";
import { registerForPush } from "../src/lib/push";
import { openDriverSocket, type DriverSocket } from "../src/lib/ws";
import { colors, styles } from "../src/ui";

type RideOffer = Extract<ServerMessage, { type: "rideOffer" }>;

export default function DriverHome() {
  const router = useRouter();
  const [online, setOnline] = useState(false);
  const [offer, setOffer] = useState<RideOffer | null>(null);
  const [profile, setProfile] = useState<DriverProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<DriverSocket | null>(null);
  const watcherRef = useRef<Location.LocationSubscription | null>(null);

  useEffect(() => {
    getCurrentUser().catch(() => router.replace("/sign-in"));
    getDriverProfile().then(setProfile).catch(() => {});
    void registerForPush(submitPushToken);
    return () => goOffline();
  }, [router]);

  const approved = profile?.verificationStatus === "APPROVED";

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

  async function onStripeOnboarding() {
    setError(null);
    try {
      const url = await startStripeOnboarding();
      await Linking.openURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Onboarding konnte nicht gestartet werden");
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

      {profile && !approved ? (
        <View
          style={{
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 12,
            padding: 14,
            gap: 6,
          }}
        >
          <Text style={{ fontSize: 15, color: colors.text, fontWeight: "600" }}>
            {profile.verificationStatus === "PENDING"
              ? "Deine Dokumente werden geprüft."
              : profile.verificationStatus === "REJECTED"
                ? "Deine Verifizierung wurde abgelehnt – bitte Dokumente erneut einreichen."
                : "Bevor du fahren kannst, müssen wir deine Dokumente prüfen."}
          </Text>
          <Link href="/documents" style={[styles.linkText, { marginTop: 0, textAlign: "left" }]}>
            Dokumente hochladen →
          </Link>
        </View>
      ) : null}

      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <Switch value={online} onValueChange={toggleOnline} disabled={!approved} />
        <Text style={{ fontSize: 16, color: approved ? colors.text : colors.muted }}>
          Fahrbereit{approved ? "" : " (erst nach Verifizierung)"}
        </Text>
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

      <Link href="/earnings" style={styles.linkText}>
        Verdienst ansehen
      </Link>
      <Pressable onPress={onStripeOnboarding}>
        <Text style={styles.linkText}>Auszahlungskonto einrichten (Stripe)</Text>
      </Pressable>
      <Pressable onPress={onSignOut}>
        <Text style={styles.linkText}>Abmelden</Text>
      </Pressable>
    </View>
  );
}
