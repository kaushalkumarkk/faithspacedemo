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

const DEMO_ACCOUNTS = [
  { label: "Admin", email: "admin@faithspace.demo", role: "admin" },
  { label: "Daniel (Creator)", email: "creator@faithspace.demo", role: "creator" },
  { label: "Priya (Creator 2)", email: "creator2@faithspace.demo", role: "creator" },
  { label: "Vera (Viewer)", email: "viewer@faithspace.demo", role: "viewer" },
  { label: "Victor (Viewer 2)", email: "viewer2@faithspace.demo", role: "viewer" },
] as const;

export default function LoginScreen() {
  const { login, register, apiUrl, updateApiUrl } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<"viewer" | "creator">("viewer");
  const [serverInput, setServerInput] = useState(apiUrl);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async () => {
    if (!email.trim() || !password) {
      Alert.alert("Missing fields", "Enter your email and password.");
      return;
    }
    setBusy(true);
    try {
      await updateApiUrl(serverInput);
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

  const quickLogin = async (demoEmail: string) => {
    setBusy(true);
    try {
      await updateApiUrl(serverInput);
      await login(demoEmail, "Demo1234!");
    } catch (e) {
      Alert.alert("Demo login failed", (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <View style={styles.brand}>
            <View style={styles.logoBadge}>
              <Text style={styles.logoText}>FS</Text>
            </View>
            <Text style={styles.title}>Faith Space</Text>
            <Text style={styles.subtitle}>Expo Go SDK 58 Mobile Client</Text>
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
              placeholder="you@faithspace.demo"
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
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>One-tap demo accounts (Demo1234!)</Text>
            <Text style={styles.hint}>Log in as Viewer on Phone 1 and Creator on Phone 2 for two-phone messaging.</Text>
            <View style={styles.demoGrid}>
              {DEMO_ACCOUNTS.map((a) => (
                <Pressable key={a.email} style={styles.demoBtn} onPress={() => quickLogin(a.email)} disabled={busy}>
                  <Text style={styles.demoBtnText}>{a.label}</Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Backend API URL</Text>
            <Text style={styles.hint}>Auto-detected from Expo host. Change to your PC&apos;s LAN IP (e.g. http://192.168.1.5:8000) if needed.</Text>
            <TextInput
              style={styles.input}
              autoCapitalize="none"
              autoCorrect={false}
              value={serverInput}
              onChangeText={setServerInput}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#0d0c12" },
  container: { padding: 20, gap: 16 },
  brand: { alignItems: "center", marginVertical: 12 },
  logoBadge: { width: 56, height: 56, borderRadius: 16, backgroundColor: "#7c5cff", alignItems: "center", justifyContent: "center", marginBottom: 8 },
  logoText: { color: "#fff", fontSize: 22, fontWeight: "800" },
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
  primaryBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  sectionTitle: { color: "#fff", fontWeight: "700", fontSize: 14 },
  hint: { color: "#9c9aa8", fontSize: 12, lineHeight: 17 },
  demoGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
  demoBtn: { backgroundColor: "#252336", paddingHorizontal: 12, paddingVertical: 9, borderRadius: 10, borderWidth: 1, borderColor: "#373452" },
  demoBtnText: { color: "#fff", fontSize: 12, fontWeight: "600" },
});
