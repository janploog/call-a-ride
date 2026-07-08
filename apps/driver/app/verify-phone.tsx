import {
  confirmUserAttribute,
  fetchAuthSession,
  fetchUserAttributes,
  sendUserAttributeVerificationCode,
} from "aws-amplify/auth";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { styles } from "../src/ui";

/**
 * Telefonnummer per SMS-Code bestätigen. Ohne verifizierte Nummer lehnt das
 * Backend Buchungen ab (Fahrgast) bzw. das Online-Gehen (Fahrer).
 */
export default function VerifyPhone() {
  const router = useRouter();
  const [phone, setPhone] = useState<string | null>(null);
  const [codeSent, setCodeSent] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetchUserAttributes()
      .then((attrs) => setPhone(attrs.phone_number ?? null))
      .catch(() => {});
  }, []);

  async function onSendCode() {
    setError(null);
    setBusy(true);
    try {
      await sendUserAttributeVerificationCode({ userAttributeKey: "phone_number" });
      setCodeSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "SMS konnte nicht gesendet werden");
    } finally {
      setBusy(false);
    }
  }

  async function onConfirm() {
    setError(null);
    setBusy(true);
    try {
      await confirmUserAttribute({
        userAttributeKey: "phone_number",
        confirmationCode: code.trim(),
      });
      // Token erneuern, damit der phone_number_verified-Claim sofort greift
      await fetchAuthSession({ forceRefresh: true });
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bestätigung fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Nummer bestätigen</Text>
      <Text style={styles.subtitle}>
        Wir senden einen Code per SMS an {phone ?? "deine Nummer"}. Fahrgäste
        müssen dich unter dieser Nummer erreichen können.
      </Text>

      {!codeSent ? (
        <Pressable style={styles.button} onPress={onSendCode} disabled={busy}>
          <Text style={styles.buttonText}>{busy ? "Sende…" : "Code per SMS senden"}</Text>
        </Pressable>
      ) : (
        <>
          <TextInput
            style={styles.input}
            placeholder="SMS-Code"
            keyboardType="number-pad"
            value={code}
            onChangeText={setCode}
          />
          <Pressable style={styles.button} onPress={onConfirm} disabled={busy}>
            <Text style={styles.buttonText}>{busy ? "Prüfe…" : "Bestätigen"}</Text>
          </Pressable>
          <Pressable onPress={onSendCode}>
            <Text style={styles.linkText}>Code erneut senden</Text>
          </Pressable>
        </>
      )}

      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}
