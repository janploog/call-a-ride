import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, Text, View } from "react-native";
import { listMyRides, type RideHistoryEntry } from "../src/lib/api";
import { colors, styles } from "../src/ui";

const STATUS_LABELS: Record<string, string> = {
  COMPLETED: "Abgeschlossen",
  CANCELLED: "Storniert",
  NO_DRIVER_FOUND: "Kein Fahrer",
  IN_PROGRESS: "Läuft",
  DRIVER_ARRIVING: "Fahrer unterwegs",
  ASSIGNED: "Zugewiesen",
  MATCHING: "Suche läuft",
  REQUESTED: "Angefragt",
};

const PAYMENT_LABELS: Record<string, string> = {
  PAID: "bezahlt",
  PROCESSING: "Zahlung läuft",
  FAILED: "Zahlung fehlgeschlagen",
  NO_PAYMENT_METHOD: "kein Zahlungsmittel",
};

export default function HistoryScreen() {
  const router = useRouter();
  const [rides, setRides] = useState<RideHistoryEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listMyRides()
      .then(setRides)
      .catch((e) =>
        setError(e instanceof Error ? e.message : "Historie konnte nicht geladen werden"),
      );
  }, []);

  if (error) {
    return (
      <View style={styles.screen}>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }
  if (!rides) {
    return (
      <View style={styles.screen}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <View style={[styles.screen, { justifyContent: "flex-start" }]}>
      <Text style={styles.title}>Meine Fahrten</Text>
      <FlatList
        data={rides}
        keyExtractor={(item) => item.rideId}
        ListEmptyComponent={<Text style={styles.subtitle}>Noch keine Fahrten.</Text>}
        renderItem={({ item }) => (
          <Pressable
            onPress={() =>
              router.push({ pathname: "/ride/[rideId]", params: { rideId: item.rideId } })
            }
            style={{
              paddingVertical: 12,
              borderBottomWidth: 1,
              borderBottomColor: colors.border,
              gap: 2,
            }}
          >
            <Text style={{ fontSize: 15, color: colors.text, fontWeight: "600" }}>
              {item.pickupAddress} → {item.dropoffAddress}
            </Text>
            <Text style={{ fontSize: 13, color: colors.muted }}>
              {new Date(item.createdAt).toLocaleString("de-DE")} ·{" "}
              {STATUS_LABELS[item.status] ?? item.status}
              {item.paymentStatus
                ? ` · ${PAYMENT_LABELS[item.paymentStatus] ?? item.paymentStatus}`
                : ""}
            </Text>
            <Text style={{ fontSize: 14, color: colors.text }}>
              {(item.estimatedFareCents / 100).toFixed(2)} €
            </Text>
          </Pressable>
        )}
      />
    </View>
  );
}
