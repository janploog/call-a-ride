import { confirmSignUp, resendSignUpCode } from "aws-amplify/auth";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { styles } from "../src/ui";

export default function Confirm() {
  const router = useRouter();
  const { email } = useLocalSearchParams<{ email: string }>();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onConfirm() {
    if (!email) return;
    setError(null);
    setBusy(true);
    try {
      await confirmSignUp({ username: email, confirmationCode: code.trim() });
      router.replace("/sign-in");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bestätigung fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  }

  async function onResend() {
    if (!email) return;
    setError(null);
    try {
      await resendSignUpCode({ username: email });
      setInfo("Neuer Code wurde versendet.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Code konnte nicht gesendet werden");
    }
  }

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>E-Mail bestätigen</Text>
      <Text style={styles.subtitle}>
        Wir haben einen Bestätigungscode an {email ?? "deine E-Mail"} gesendet.
      </Text>
      <TextInput
        style={styles.input}
        placeholder="Bestätigungscode"
        keyboardType="number-pad"
        value={code}
        onChangeText={setCode}
      />
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      {info ? <Text style={styles.successText}>{info}</Text> : null}
      <Pressable style={styles.button} onPress={onConfirm} disabled={busy}>
        <Text style={styles.buttonText}>{busy ? "Bestätigen…" : "Bestätigen"}</Text>
      </Pressable>
      <Pressable onPress={onResend}>
        <Text style={styles.linkText}>Code erneut senden</Text>
      </Pressable>
    </View>
  );
}
