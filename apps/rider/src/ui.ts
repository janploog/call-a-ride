import { StyleSheet } from "react-native";

export const colors = {
  bg: "#ffffff",
  text: "#111827",
  muted: "#6b7280",
  primary: "#111827",
  primaryText: "#ffffff",
  border: "#d1d5db",
  error: "#b91c1c",
  success: "#15803d",
};

export const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
    padding: 24,
    justifyContent: "center",
    gap: 12,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: colors.text,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: colors.muted,
    marginBottom: 16,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.text,
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 4,
  },
  buttonText: {
    color: colors.primaryText,
    fontSize: 16,
    fontWeight: "600",
  },
  linkText: {
    color: colors.muted,
    textAlign: "center",
    marginTop: 12,
    fontSize: 15,
  },
  errorText: {
    color: colors.error,
    fontSize: 14,
  },
  successText: {
    color: colors.success,
    fontSize: 14,
  },
});
