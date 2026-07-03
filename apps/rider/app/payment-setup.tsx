import { useStripe } from "@stripe/stripe-react-native";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { createSetupIntent } from "../src/lib/api";
import { styles } from "../src/ui";

/**
 * Karte für spätere Fahrten hinterlegen (Stripe PaymentSheet, SetupIntent).
 * Die Abbuchung passiert off-session automatisch nach Fahrtende.
 */
export default function PaymentSetup() {
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function onSetup() {
    setBusy(true);
    setError(null);
    try {
      const intent = await createSetupIntent();
      const init = await initPaymentSheet({
        merchantDisplayName: "Call-a-Ride",
        customerId: intent.customerId,
        customerEphemeralKeySecret: intent.ephemeralKeySecret,
        setupIntentClientSecret: intent.setupIntentClientSecret,
        allowsDelayedPaymentMethods: false,
      });
      if (init.error) throw new Error(init.error.message);
      const result = await presentPaymentSheet();
      if (result.error) {
        if (result.error.code !== "Canceled") throw new Error(result.error.message);
      } else {
        setDone(true);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Einrichtung fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Zahlungsmittel</Text>
      <Text style={styles.subtitle}>
        Hinterlege eine Karte – der Fahrpreis wird nach Fahrtende automatisch
        abgebucht. Du zahlst nie im Auto.
      </Text>
      {done ? (
        <Text style={styles.successText}>Karte erfolgreich hinterlegt ✓</Text>
      ) : (
        <Pressable style={styles.button} onPress={onSetup} disabled={busy}>
          <Text style={styles.buttonText}>{busy ? "Lade…" : "Karte hinterlegen"}</Text>
        </Pressable>
      )}
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}
