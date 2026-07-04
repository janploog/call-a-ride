import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

/**
 * Registriert das Gerät für Expo-Push und meldet das Token ans Backend.
 * Ohne EAS-Projekt-ID (lokale Dev-Builds vor `eas init`) oder ohne
 * Berechtigung passiert still nichts — Push ist ein Zusatzkanal.
 */
export async function registerForPush(
  submitToken: (token: string) => Promise<void>,
): Promise<void> {
  try {
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) return;

    const permissions = await Notifications.requestPermissionsAsync();
    if (!permissions.granted) return;

    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "Standard",
        importance: Notifications.AndroidImportance.MAX,
        sound: "default",
      });
    }

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    await submitToken(token);
  } catch (err) {
    console.warn("push registration skipped", err);
  }
}
