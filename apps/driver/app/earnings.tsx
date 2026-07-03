import { useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { getEarnings, type Earnings } from "../src/lib/api";
import { colors, styles } from "../src/ui";

const euro = (cents: number) => `${(cents / 100).toFixed(2)} €`;

export default function EarningsScreen() {
  const [earnings, setEarnings] = useState<Earnings | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getEarnings()
      .then(setEarnings)
      .catch((e) =>
        setError(e instanceof Error ? e.message : "Verdienst konnte nicht geladen werden"),
      );
  }, []);

  if (error) {
    return (
      <View style={styles.screen}>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }
  if (!earnings) {
    return (
      <View style={styles.screen}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  const rows: Array<[string, string]> = [
    ["Heute", euro(earnings.todayCents)],
    ["Diese Woche", euro(earnings.weekCents)],
    ["Gesamt", euro(earnings.totalCents)],
    ["Abgeschlossene Fahrten", String(earnings.completedRides)],
  ];

  return (
    <View style={[styles.screen, { justifyContent: "flex-start" }]}>
      <Text style={styles.title}>Dein Verdienst</Text>
      <Text style={styles.subtitle}>
        Beträge nach Abzug der Plattform-Provision. Auszahlungen laufen
        automatisch über Stripe.
      </Text>
      {rows.map(([label, value]) => (
        <View
          key={label}
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            paddingVertical: 10,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
          }}
        >
          <Text style={{ fontSize: 16, color: colors.muted }}>{label}</Text>
          <Text style={{ fontSize: 16, fontWeight: "600", color: colors.text }}>{value}</Text>
        </View>
      ))}
    </View>
  );
}
