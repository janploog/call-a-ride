import { signIn } from "aws-amplify/auth";
import { Link, useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { styles } from "../src/ui";

export default function SignIn() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSignIn() {
    setError(null);
    setBusy(true);
    try {
      const { isSignedIn, nextStep } = await signIn({ username: email.trim(), password });
      if (isSignedIn) {
        router.replace("/home");
      } else if (nextStep.signInStep === "CONFIRM_SIGN_UP") {
        router.push({ pathname: "/confirm", params: { email: email.trim() } });
      } else {
        setError(`Zusätzlicher Schritt nötig: ${nextStep.signInStep}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Anmeldung fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Willkommen zurück</Text>
      <Text style={styles.subtitle}>Melde dich mit deiner E-Mail-Adresse an.</Text>
      <TextInput
        style={styles.input}
        placeholder="E-Mail"
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        placeholder="Passwort"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      <Pressable style={styles.button} onPress={onSignIn} disabled={busy}>
        <Text style={styles.buttonText}>{busy ? "Anmelden…" : "Anmelden"}</Text>
      </Pressable>
      <Link href="/sign-up" style={styles.linkText}>
        Noch kein Konto? Jetzt registrieren
      </Link>
    </View>
  );
}
