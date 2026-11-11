import { Ionicons } from "@expo/vector-icons";
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
import { Theme } from "@/lib/theme";

export default function LoginScreen() {
  const { login, register, guest } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<"viewer" | "creator">("viewer");
  const [showPass, setShowPass] = useState(false);
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
            <Text style={styles.subtitle}>Short Video · Direct Messaging · Moderated Community</Text>
          </View>

          <View style={styles.card}>
            <View style={styles.tabRow}>
              {(["login", "register"] as const).map((m) => (
                <Pressable key={m} onPress={() => setMode(m)} style={[styles.tab, mode === m && styles.tabActive]}>
                  <Text style={[styles.tabText, mode === m && styles.tabTextActive]}>
                    {m === "login" ? "Sign in" : "Create account"}
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
                  placeholderTextColor={Theme.textMuted}
                  value={displayName}
                  onChangeText={setDisplayName}
                />
                <Text style={styles.label}>Account type</Text>
                <View style={styles.roleRow}>
                  {(["viewer", "creator"] as const).map((r) => (
                    <Pressable key={r} onPress={() => setRole(r)} style={[styles.roleChip, role === r && styles.roleChipActive]}>
                      <Ionicons
                        name={r === "creator" ? "videocam-outline" : "play-outline"}
                        size={15}
                        color={role === r ? Theme.text : Theme.textMuted}
                      />
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
              placeholderTextColor={Theme.textMuted}
              value={email}
              onChangeText={setEmail}
            />

            <Text style={styles.label}>Password</Text>
            <View style={styles.passWrap}>
              <TextInput
                style={styles.passInput}
                secureTextEntry={!showPass}
                placeholder="Enter password"
                placeholderTextColor={Theme.textMuted}
                value={password}
                onChangeText={setPassword}
              />
              <Pressable onPress={() => setShowPass((s) => !s)} style={styles.eyeBtn}>
                <Ionicons name={showPass ? "eye-off-outline" : "eye-outline"} size={18} color={Theme.textMuted} />
              </Pressable>
            </View>

            <Pressable style={[styles.primaryBtn, busy && { opacity: 0.7 }]} onPress={handleSubmit} disabled={busy}>
              {busy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryBtnText}>{mode === "login" ? "Sign in" : "Create account"}</Text>
              )}
            </Pressable>

            <View style={styles.dividerRow}>
              <View style={styles.divider} />
              <Text style={styles.dividerText}>or</Text>
              <View style={styles.divider} />
            </View>

            <Pressable style={styles.secondaryBtn} onPress={handleGuest} disabled={busy}>
              <Ionicons name="sparkles-outline" size={16} color={Theme.accent} />
              <Text style={styles.secondaryBtnText}>Continue as guest</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Theme.bg },
  container: { flexGrow: 1, justifyContent: "center", padding: 20, gap: 18 },
  brand: { alignItems: "center", marginBottom: 4 },
  logoImg: { width: 76, height: 76, borderRadius: 22, marginBottom: 12, borderWidth: 1, borderColor: Theme.borderStrong },
  title: { color: Theme.text, fontSize: 30, fontWeight: "800", letterSpacing: -0.5 },
  subtitle: { color: Theme.textMuted, fontSize: 13, marginTop: 4 },
  card: { backgroundColor: Theme.surface, borderRadius: 20, padding: 18, borderWidth: 1, borderColor: Theme.border, gap: 12 },
  tabRow: { flexDirection: "row", backgroundColor: Theme.bg, borderRadius: 12, padding: 4, borderWidth: 1, borderColor: Theme.border },
  tab: { flex: 1, paddingVertical: 9, alignItems: "center", borderRadius: 9 },
  tabActive: { backgroundColor: Theme.surfaceElevated },
  tabText: { color: Theme.textMuted, fontWeight: "600", fontSize: 13 },
  tabTextActive: { color: Theme.text },
  label: { color: Theme.textSecondary, fontSize: 12, fontWeight: "600" },
  input: { backgroundColor: Theme.bg, borderWidth: 1, borderColor: Theme.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, color: Theme.text, fontSize: 14 },
  passWrap: { flexDirection: "row", alignItems: "center", backgroundColor: Theme.bg, borderWidth: 1, borderColor: Theme.border, borderRadius: 12 },
  passInput: { flex: 1, paddingHorizontal: 14, paddingVertical: 11, color: Theme.text, fontSize: 14 },
  eyeBtn: { paddingHorizontal: 12, paddingVertical: 10 },
  roleRow: { flexDirection: "row", gap: 8 },
  roleChip: { flex: 1, flexDirection: "row", gap: 6, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: Theme.border, alignItems: "center", justifyContent: "center", backgroundColor: Theme.bg },
  roleChipActive: { backgroundColor: Theme.brandSoft, borderColor: Theme.brand },
  roleText: { color: Theme.textMuted, textTransform: "capitalize", fontWeight: "600", fontSize: 13 },
  roleTextActive: { color: Theme.text },
  primaryBtn: { backgroundColor: Theme.brand, borderRadius: 12, paddingVertical: 14, alignItems: "center", marginTop: 4 },
  primaryBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  dividerRow: { flexDirection: "row", alignItems: "center", gap: 10, marginVertical: 2 },
  divider: { flex: 1, height: 1, backgroundColor: Theme.border },
  dividerText: { color: Theme.textMuted, fontSize: 12 },
  secondaryBtn: { flexDirection: "row", gap: 8, borderRadius: 12, paddingVertical: 12, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: Theme.borderStrong, backgroundColor: Theme.surfaceElevated },
  secondaryBtnText: { color: Theme.text, fontWeight: "600", fontSize: 14 },
});
