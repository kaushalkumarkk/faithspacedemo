import { Image } from "expo-image";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@/lib/auth";

export default function LoginScreen() {
  const { login, register, guest } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<"viewer" | "creator">("viewer");
  const [busy, setBusy] = useState(false);

  const handleSubmit = async () => {
    if (!email.trim() || !password) {
      Alert.alert("Missing fields", "Enter your email and password.");
      return;
    }
    setBusy(true);
    try {
      if (mode === "login") {
        await login(email.trim(), password);
      } else {
        await register({ email: email.trim(), password, display_name: displayName.trim() || "Member", role });
      }
    } catch (e) {
      Alert.alert("Authentication failed", (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleGuest = async () => {
    setBusy(true);
    try {
      await guest();
    } catch (e) {
      Alert.alert("Could not start a guest session", (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <View style={styles.brand}>
            <Image source={require("@/assets/images/logo.png")} style={styles.logoImg} contentFit="cover" />
            <Text style={styles.title}>ConnectSphere</Text>
            <Text style={styles.subtitle}>Video · Messaging · Community</Text>
          </View>

          <View style={styles.card}>
            <View style={styles.tabRow}>
              {(["login", "register"] as const).map((m) => (
                <Pressable key={m} onPress={() => setMode(m)} style={[styles.tab, mode === m && styles.tabActive]}>
                  <Text style={[styles.tabText, mode === m && styles.tabTextActive]}>
                    {m === "login" ? "Log in" : "Create account"}
                  </Text>
                </Pressable>
              ))}
            </View>

            {mode === "register" && (
              <>
                <Text style={styles.label}>Display name</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Your name"
                  placeholderTextColor="#7c7b8a"
                  value={displayName}
                  onChangeText={setDisplayName}
                />
                <View style={styles.roleRow}>
                  {(["viewer", "creator"] as const).map((r) => (
                    <Pressable key={r} onPress={() => setRole(r)} style={[styles.roleChip, role === r && styles.roleChipActive]}>
                      <Text style={[styles.roleText, role === r && styles.roleTextActive]}>{r}</Text>
                    </Pressable>
                  ))}
                </View>
              </>
            )}

            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              autoCapitalize="none"
              keyboardType="email-address"
              placeholder="you@example.com"
              placeholderTextColor="#7c7b8a"
              value={email}
              onChangeText={setEmail}
            />

            <Text style={styles.label}>Password</Text>
            <TextInput
              style={styles.input}
              secureTextEntry
              placeholder="Password"
              placeholderTextColor="#7c7b8a"
              value={password}
              onChangeText={setPassword}
            />

            <Pressable style={styles.primaryBtn} onPress={handleSubmit} disabled={busy}>
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>{mode === "login" ? "Sign in" : "Register"}</Text>}
            </Pressable>
            <Pressable style={styles.secondaryBtn} onPress={handleGuest} disabled={busy}>
              <Text style={styles.secondaryBtnText}>Continue as guest</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#0d0c12" },
  container: { flexGrow: 1, justifyContent: "center", padding: 20, gap: 16 },
  brand: { alignItems: "center", marginVertical: 12 },
  logoImg: { width: 72, height: 72, borderRadius: 20, marginBottom: 10 },
  title: { color: "#fff", fontSize: 28, fontWeight: "700" },
  subtitle: { color: "#9c9aa8", fontSize: 13, marginTop: 2 },
  card: { backgroundColor: "#171622", borderRadius: 16, padding: 16, borderWidth: 1, borderColor: "#282638", gap: 10 },
  tabRow: { flexDirection: "row", backgroundColor: "#0d0c12", borderRadius: 10, padding: 4 },
  tab: { flex: 1, paddingVertical: 8, alignItems: "center", borderRadius: 8 },
  tabActive: { backgroundColor: "#282638" },
  tabText: { color: "#9c9aa8", fontWeight: "600", fontSize: 13 },
  tabTextActive: { color: "#fff" },
  label: { color: "#c9c8d4", fontSize: 12, fontWeight: "600" },
  input: { backgroundColor: "#0d0c12", borderWidth: 1, borderColor: "#2f2d42", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: "#fff", fontSize: 14 },
  roleRow: { flexDirection: "row", gap: 8 },
  roleChip: { flex: 1, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: "#2f2d42", alignItems: "center" },
  roleChipActive: { backgroundColor: "#7c5cff33", borderColor: "#7c5cff" },
  roleText: { color: "#9c9aa8", textTransform: "capitalize", fontWeight: "600" },
  roleTextActive: { color: "#fff" },
  primaryBtn: { backgroundColor: "#7c5cff", borderRadius: 12, paddingVertical: 13, alignItems: "center", marginTop: 4 },
  secondaryBtn: { borderRadius: 12, paddingVertical: 12, alignItems: "center", borderWidth: 1, borderColor: "#2f2d42" },
  secondaryBtnText: { color: "#c9c8d4", fontWeight: "600", fontSize: 14 },
  primaryBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
});
