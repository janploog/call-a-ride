import { getCurrentUser } from "aws-amplify/auth";
import { useRouter } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { styles } from "../src/ui";

/** Einstiegspunkt: leitet je nach Sitzungszustand zu Home oder Login. */
export default function Index() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    getCurrentUser()
      .then(() => !cancelled && router.replace("/home"))
      .catch(() => !cancelled && router.replace("/sign-in"));
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <View style={styles.screen}>
      <ActivityIndicator size="large" />
    </View>
  );
}
