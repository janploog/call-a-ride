import type { Ride, RideStatus } from "@call-a-ride/core";
import * as Location from "expo-location";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Linking, Pressable, Text, View } from "react-native";
import { getRide, rateRide, updateRideStatus } from "../../src/lib/api";
import { openDriverSocket, type DriverSocket } from "../../src/lib/ws";
import { colors, styles } from "../../src/ui";

/**
 * Aktive Fahrt aus Fahrersicht: Position läuft mit activeRideId weiter an den
 * Fahrgast; der Fahrer meldet Einstieg (IN_PROGRESS) und Abschluss (COMPLETED).
 */
export default function DriverRideScreen() {
  const router = useRouter();
  const { rideId } = useLocalSearchParams<{ rideId: string }>();
  const [ride, setRide] = useState<Ride | null>(null);
  const [status, setStatus] = useState<RideStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [rated, setRated] = useState(false);
  const socketRef = useRef<DriverSocket | null>(null);
  const watcherRef = useRef<Location.LocationSubscription | null>(null);

  useEffect(() => {
    if (!rideId) return;
    let cancelled = false;

    (async () => {
      const loaded = await getRide(rideId);
      if (cancelled) return;
      setRide(loaded);
      setStatus(loaded.status);

      const socket = await openDriverSocket((message) => {
        // Fahrgast hat storniert → Fahrt beenden, Fahrer informieren
        if (message.type === "rideCancelled" && message.rideId === rideId) {
          setStatus("CANCELLED");
          watcherRef.current?.remove();
        }
      });
      socketRef.current = socket;
      watcherRef.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: 4000,
          distanceInterval: 15,
        },
        (pos) => {
          socket.sendLocation({
            position: { lat: pos.coords.latitude, lon: pos.coords.longitude },
            available: false,
            activeRideId: rideId,
          });
        },
      );
    })().catch((e) =>
      setError(e instanceof Error ? e.message : "Fahrt konnte nicht geladen werden"),
    );

    return () => {
      cancelled = true;
      watcherRef.current?.remove();
      socketRef.current?.close();
    };
  }, [rideId]);

  async function onAdvance(next: "IN_PROGRESS" | "COMPLETED") {
    if (!rideId) return;
    setBusy(true);
    setError(null);
    try {
      await updateRideStatus(rideId, next);
      setStatus(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Statuswechsel fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  }

  if (error && !ride) {
    return (
      <View style={styles.screen}>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }
  if (!ride || !status) {
    return (
      <View style={styles.screen}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <View style={[styles.screen, { justifyContent: "flex-start" }]}>
      <Text style={styles.title}>
        {status === "COMPLETED"
          ? "Fahrt abgeschlossen"
          : status === "CANCELLED"
            ? "Fahrt storniert"
            : "Aktive Fahrt"}
      </Text>
      {status === "CANCELLED" ? (
        <Text style={styles.errorText}>
          Der Fahrgast hat die Fahrt storniert. Du kannst wieder online gehen.
        </Text>
      ) : null}
      <Text style={styles.subtitle}>
        Abholung: {ride.pickupAddress}
        {"\n"}Ziel: {ride.dropoffAddress}
        {"\n"}
        {(ride.distanceMeters / 1000).toFixed(1)} km ·{" "}
        {(ride.estimatedFareCents / 100).toFixed(2)} €
      </Text>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      {status === "ASSIGNED" || status === "DRIVER_ARRIVING" || status === "IN_PROGRESS" ? (
        <View style={{ flexDirection: "row", gap: 10 }}>
          <Pressable
            style={[styles.button, { flex: 1 }]}
            onPress={() => {
              // Vor Fahrtbeginn zum Abholort navigieren, danach zum Ziel
              const target = status === "IN_PROGRESS" ? ride.dropoff : ride.pickup;
              void Linking.openURL(
                `https://www.google.com/maps/dir/?api=1&destination=${target.lat},${target.lon}&travelmode=driving`,
              );
            }}
          >
            <Text style={styles.buttonText}>🧭 Navigation</Text>
          </Pressable>
          {ride.riderPhone ? (
            <Pressable
              style={[styles.button, { flex: 1 }]}
              onPress={() => void Linking.openURL(`tel:${ride.riderPhone}`)}
            >
              <Text style={styles.buttonText}>📞 Anrufen</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {status === "DRIVER_ARRIVING" || status === "ASSIGNED" ? (
        <Pressable
          style={styles.button}
          onPress={() => onAdvance("IN_PROGRESS")}
          disabled={busy}
        >
          <Text style={styles.buttonText}>Fahrgast eingestiegen – Fahrt starten</Text>
        </Pressable>
      ) : null}

      {status === "IN_PROGRESS" ? (
        <Pressable
          style={styles.button}
          onPress={() => onAdvance("COMPLETED")}
          disabled={busy}
        >
          <Text style={styles.buttonText}>Fahrt beenden</Text>
        </Pressable>
      ) : null}

      {status === "COMPLETED" && !rated ? (
        <View style={{ gap: 6 }}>
          <Text style={styles.subtitle}>Wie war der Fahrgast?</Text>
          <View style={{ flexDirection: "row", gap: 8, justifyContent: "center" }}>
            {[1, 2, 3, 4, 5].map((stars) => (
              <Pressable
                key={stars}
                onPress={() =>
                  rideId ? rateRide(rideId, stars).finally(() => setRated(true)) : null
                }
              >
                <Text style={{ fontSize: 30 }}>⭐</Text>
                <Text style={{ textAlign: "center", color: colors.muted }}>{stars}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      {status === "COMPLETED" || status === "CANCELLED" ? (
        <Pressable style={styles.button} onPress={() => router.replace("/home")}>
          <Text style={styles.buttonText}>Zurück – wieder online gehen</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
