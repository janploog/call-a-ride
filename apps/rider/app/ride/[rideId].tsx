import type { Coordinate, Ride, RideStatus } from "@call-a-ride/core";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { RideMap } from "../../src/components/RideMap";
import { cancelRide, getRide, rateRide } from "../../src/lib/api";
import { openUserSocket } from "../../src/lib/ws";
import { colors, styles } from "../../src/ui";

const CANCELLABLE: RideStatus[] = ["REQUESTED", "MATCHING", "ASSIGNED", "DRIVER_ARRIVING"];

const STATUS_STEPS: Array<{ status: RideStatus; label: string }> = [
  { status: "REQUESTED", label: "Fahrt angefragt" },
  { status: "MATCHING", label: "Fahrer wird gesucht…" },
  { status: "ASSIGNED", label: "Fahrer zugewiesen" },
  { status: "DRIVER_ARRIVING", label: "Fahrer ist unterwegs zu dir" },
  { status: "IN_PROGRESS", label: "Fahrt läuft" },
  { status: "COMPLETED", label: "Fahrt abgeschlossen" },
];

export default function RideScreen() {
  const router = useRouter();
  const { rideId } = useLocalSearchParams<{ rideId: string }>();
  const [ride, setRide] = useState<Ride | null>(null);
  const [status, setStatus] = useState<RideStatus | null>(null);
  const [driverPosition, setDriverPosition] = useState<Coordinate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [rated, setRated] = useState(false);

  useEffect(() => {
    if (!rideId) return;
    let close: (() => void) | undefined;
    let cancelled = false;

    (async () => {
      // Erst den Live-Kanal öffnen, dann den Ist-Zustand laden — so geht kein
      // Statuswechsel zwischen Laden und Verbinden verloren.
      close = await openUserSocket((message) => {
        if (message.type === "rideStatusChanged" && message.rideId === rideId) {
          setStatus(message.status);
        }
        if (message.type === "driverPosition" && message.rideId === rideId) {
          setDriverPosition(message.position);
        }
      });
      const loaded = await getRide(rideId);
      if (!cancelled) {
        setRide(loaded);
        setStatus((current) => current ?? loaded.status);
      }
    })().catch((e) =>
      setError(e instanceof Error ? e.message : "Fahrt konnte nicht geladen werden"),
    );

    return () => {
      cancelled = true;
      close?.();
    };
  }, [rideId]);

  if (error) {
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

  const activeIndex = STATUS_STEPS.findIndex((s) => s.status === status);
  const isTerminal = status === "COMPLETED" || status === "CANCELLED" || status === "NO_DRIVER_FOUND";

  async function onCancel() {
    if (!rideId) return;
    setBusy(true);
    setError(null);
    try {
      await cancelRide(rideId);
      setStatus("CANCELLED");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Stornierung fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  }

  async function onRate(stars: number) {
    if (!rideId) return;
    try {
      await rateRide(rideId, stars);
      setRated(true);
    } catch {
      setRated(true); // bereits bewertet o. ä. – UI nicht blockieren
    }
  }

  return (
    <View style={[styles.screen, { justifyContent: "flex-start" }]}>
      <RideMap pickup={ride.pickup} dropoff={ride.dropoff} driver={driverPosition} />
      <Text style={styles.title}>Deine Fahrt</Text>
      <Text style={styles.subtitle}>
        {ride.pickupAddress} → {ride.dropoffAddress}
        {"\n"}
        {(ride.distanceMeters / 1000).toFixed(1)} km ·{" "}
        {(ride.estimatedFareCents / 100).toFixed(2)} €
      </Text>

      {STATUS_STEPS.map((step, i) => (
        <Text
          key={step.status}
          style={{
            fontSize: 16,
            paddingVertical: 4,
            color: i <= activeIndex ? colors.text : colors.muted,
            fontWeight: i === activeIndex ? "700" : "400",
          }}
        >
          {i <= activeIndex ? "●" : "○"} {step.label}
        </Text>
      ))}

      {status === "NO_DRIVER_FOUND" ? (
        <Text style={styles.errorText}>Leider wurde kein Fahrer gefunden.</Text>
      ) : null}

      {status === "CANCELLED" ? (
        <Text style={styles.errorText}>Die Fahrt wurde storniert.</Text>
      ) : null}

      {status === "COMPLETED" ? (
        <>
          <Text style={styles.successText}>
            Der Fahrpreis wird automatisch von deinem hinterlegten Zahlungsmittel
            abgebucht. Den Beleg findest du in deiner Fahrthistorie.
          </Text>
          {rated ? (
            <Text style={styles.successText}>Danke für deine Bewertung!</Text>
          ) : (
            <View style={{ flexDirection: "row", gap: 8, justifyContent: "center" }}>
              {[1, 2, 3, 4, 5].map((stars) => (
                <Pressable key={stars} onPress={() => onRate(stars)}>
                  <Text style={{ fontSize: 30 }}>⭐</Text>
                  <Text style={{ textAlign: "center", color: colors.muted }}>{stars}</Text>
                </Pressable>
              ))}
            </View>
          )}
        </>
      ) : null}

      {CANCELLABLE.includes(status) ? (
        <Pressable onPress={onCancel} disabled={busy}>
          <Text style={[styles.linkText, { color: colors.error }]}>
            {busy ? "Storniere…" : "Fahrt stornieren"}
          </Text>
        </Pressable>
      ) : null}

      {isTerminal ? (
        <Pressable style={styles.button} onPress={() => router.replace("/home")}>
          <Text style={styles.buttonText}>Neue Fahrt planen</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
