import type { Coordinate, PlaceResult, RouteQuote } from "@call-a-ride/core";
import { fetchUserAttributes, getCurrentUser, signOut } from "aws-amplify/auth";
import * as Location from "expo-location";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { Link } from "expo-router";
import { RideMap } from "../src/components/RideMap";
import { createRide, getQuote, searchPlaces, submitPushToken } from "../src/lib/api";
import { registerForPush } from "../src/lib/push";
import { styles } from "../src/ui";

// Fallback, solange keine Standortfreigabe vorliegt (Berlin Mitte)
const FALLBACK_PICKUP: Coordinate = { lat: 52.520008, lon: 13.404954 };

export default function Home() {
  const router = useRouter();
  const [pickup, setPickup] = useState<Coordinate>(FALLBACK_PICKUP);
  const [pickupLabel, setPickupLabel] = useState("Aktueller Standort");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [destination, setDestination] = useState<PlaceResult | null>(null);
  const [quote, setQuote] = useState<RouteQuote | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phoneVerified, setPhoneVerified] = useState(true);

  // Beim (Wieder-)Fokussieren prüfen – z. B. nach Rückkehr vom Verifizieren
  useFocusEffect(
    useCallback(() => {
      fetchUserAttributes()
        .then((attrs) => setPhoneVerified(attrs.phone_number_verified === "true"))
        .catch(() => {});
    }, []),
  );

  useEffect(() => {
    getCurrentUser().catch(() => router.replace("/sign-in"));
    void registerForPush(submitPushToken);
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === "granted") {
        const pos = await Location.getCurrentPositionAsync({});
        setPickup({ lat: pos.coords.latitude, lon: pos.coords.longitude });
      } else {
        setPickupLabel("Standort nicht freigegeben (Beispiel: Berlin Mitte)");
      }
    })().catch(() => setPickupLabel("Standort nicht verfügbar"));
  }, [router]);

  async function onSearch() {
    Keyboard.dismiss();
    setError(null);
    setBusy(true);
    try {
      setResults(await searchPlaces(query, pickup));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Suche fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  }

  async function onSelectDestination(place: PlaceResult) {
    setDestination(place);
    setResults([]);
    setQuote(null);
    setError(null);
    setBusy(true);
    try {
      setQuote(await getQuote(pickup, place.position));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Preisschätzung fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  }

  async function onRequestRide() {
    if (!destination) return;
    setError(null);
    setBusy(true);
    try {
      const ride = await createRide({
        pickup,
        dropoff: destination.position,
        pickupAddress: pickupLabel,
        dropoffAddress: destination.label,
      });
      router.push({ pathname: "/ride/[rideId]", params: { rideId: ride.rideId } });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fahrt konnte nicht angefragt werden");
    } finally {
      setBusy(false);
    }
  }

  async function onSignOut() {
    await signOut();
    router.replace("/sign-in");
  }

  return (
    <View style={[styles.screen, { justifyContent: "flex-start" }]}>
      <RideMap pickup={pickup} dropoff={destination?.position} />

      {!phoneVerified ? (
        <Link href="/verify-phone" style={[styles.errorText, { fontSize: 15 }]}>
          ⚠️ Telefonnummer bestätigen, um Fahrten buchen zu können →
        </Link>
      ) : null}

      <Text style={styles.subtitle}>Abholung: {pickupLabel}</Text>

      <TextInput
        style={styles.input}
        placeholder="Wohin möchtest du?"
        value={query}
        onChangeText={setQuery}
        onSubmitEditing={onSearch}
        returnKeyType="search"
      />
      <Pressable style={styles.button} onPress={onSearch} disabled={busy || query.length < 2}>
        <Text style={styles.buttonText}>Ziel suchen</Text>
      </Pressable>

      {busy ? <ActivityIndicator /> : null}
      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <FlatList
        data={results}
        keyExtractor={(item) => `${item.position.lat},${item.position.lon}`}
        renderItem={({ item }) => (
          <Pressable onPress={() => onSelectDestination(item)}>
            <Text style={[styles.subtitle, { marginBottom: 8 }]}>📍 {item.label}</Text>
          </Pressable>
        )}
      />

      {destination && quote ? (
        <View>
          <Text style={styles.subtitle}>
            Nach: {destination.label}
            {"\n"}
            {(quote.distanceMeters / 1000).toFixed(1)} km ·{" "}
            {Math.round(quote.durationSeconds / 60)} min
            {quote.approximate ? " (grobe Schätzung)" : ""}
          </Text>
          <Pressable style={styles.button} onPress={onRequestRide} disabled={busy}>
            <Text style={styles.buttonText}>
              Fahrt anfordern · {(quote.estimatedFareCents / 100).toFixed(2)} €
            </Text>
          </Pressable>
        </View>
      ) : null}

      <Link href="/history" style={styles.linkText}>
        Meine Fahrten
      </Link>
      <Link href="/payment-setup" style={styles.linkText}>
        Zahlungsmittel verwalten
      </Link>
      <Pressable onPress={onSignOut}>
        <Text style={styles.linkText}>Abmelden</Text>
      </Pressable>
    </View>
  );
}
