import { signUp } from "aws-amplify/auth";
import { Link, useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { styles } from "../src/ui";

export default function SignUp() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSignUp() {
    setError(null);
    setBusy(true);
    try {
      await signUp({
        username: email.trim(),
        password,
        options: {
          userAttributes: {
            email: email.trim(),
            // E.164-Format, z. B. +4915112345678
            phone_number: phone.trim(),
          },
        },
      });
      router.push({ pathname: "/confirm", params: { email: email.trim() } });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Registrierung fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Konto erstellen</Text>
      <Text style={styles.subtitle}>
        Die Telefonnummer braucht dein Fahrer, um dich bei der Abholung zu erreichen.
      </Text>
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
        placeholder="Telefonnummer (+49…)"
        autoComplete="tel"
        keyboardType="phone-pad"
        value={phone}
        onChangeText={setPhone}
      />
      <TextInput
        style={styles.input}
        placeholder="Passwort (mind. 10 Zeichen)"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      <Pressable style={styles.button} onPress={onSignUp} disabled={busy}>
        <Text style={styles.buttonText}>{busy ? "Registrieren…" : "Registrieren"}</Text>
      </Pressable>
      <Link href="/sign-in" style={styles.linkText}>
        Schon ein Konto? Anmelden
      </Link>
    </View>
  );
}
