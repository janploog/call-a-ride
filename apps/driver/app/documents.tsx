import * as ImagePicker from "expo-image-picker";
import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { getDriverProfile, uploadDocument } from "../src/lib/api";
import { colors, styles } from "../src/ui";

const DOCUMENT_TYPES: Array<{ key: string; label: string }> = [
  { key: "fuehrerschein", label: "Führerschein" },
  { key: "p-schein", label: "P-Schein (Personenbeförderungsschein)" },
  { key: "fahrzeugschein", label: "Fahrzeugschein" },
  { key: "versicherung", label: "Versicherungsnachweis" },
];

/**
 * Fahrer-Onboarding: Pflichtdokumente fotografieren/hochladen.
 * Nach dem Upload prüft das Admin-Team; erst mit Status APPROVED
 * kann der Fahrer online gehen.
 */
export default function DocumentsScreen() {
  const [uploaded, setUploaded] = useState<Record<string, string>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getDriverProfile()
      .then((p) => setUploaded(p.documents))
      .catch(() => {});
  }, []);

  async function onUpload(documentType: string) {
    setError(null);
    setBusyKey(documentType);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: "images",
        quality: 0.8,
      });
      const asset = result.assets?.[0];
      if (result.canceled || !asset) return;
      const contentType = asset.mimeType === "image/png" ? "image/png" : "image/jpeg";
      await uploadDocument(documentType, contentType, asset.uri);
      setUploaded((prev) => ({ ...prev, [documentType]: "uploaded" }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload fehlgeschlagen");
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <View style={[styles.screen, { justifyContent: "flex-start" }]}>
      <Text style={styles.title}>Dokumente</Text>
      <Text style={styles.subtitle}>
        Lade alle vier Nachweise hoch. Nach der Prüfung wirst du freigeschaltet
        und kannst Fahrten annehmen.
      </Text>

      {DOCUMENT_TYPES.map(({ key, label }) => {
        const done = Boolean(uploaded[key]);
        return (
          <Pressable
            key={key}
            style={[styles.button, done && { backgroundColor: colors.success }]}
            onPress={() => onUpload(key)}
            disabled={busyKey !== null}
          >
            <Text style={styles.buttonText}>
              {busyKey === key ? "Lade hoch…" : `${done ? "✓ " : ""}${label}`}
            </Text>
          </Pressable>
        );
      })}

      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}
