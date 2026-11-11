import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useState } from "react";
import {
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
import { GradientButton, hapticLight, hapticSuccess } from "@/components/ui";
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
  const [focused, setFocused] = useState<string | null>(null);
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
      hapticSuccess();
    } catch (e) {
      Alert.alert("Authentication failed", (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleGuest = async () => {
    hapticLight();
    setBusy(true);
    try {
      await guest();
      hapticSuccess();
    } catch (e) {
      Alert.alert("Could not start a guest session", (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={["#1B133D", "#0E1629", Theme.bg]}
        locations={[0, 0.45, 0.85]}
        style={StyleSheet.absoluteFill}
      />
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
            <View style={styles.brand}>
              <LinearGradient
                colors={["rgba(124,92,255,0.45)", "rgba(34,211,238,0.35)"]}
                style={styles.logoRing}
              >
                <Image source={require("@/assets/images/logo.png")} style={styles.logoImg} contentFit="cover" />
              </LinearGradient>
              <Text style={styles.title}>ConnectSphere</Text>
              <Text style={styles.subtitle}>Short Video · Direct Messaging · Community</Text>
            </View>

            <View style={styles.card}>
              <View style={styles.tabRow}>
                {(["login", "register"] as const).map((m) => (
                  <Pressable
                    key={m}
                    onPress={() => {
                      hapticLight();
                      setMode(m);
                    }}
                    style={[styles.tab, mode === m && styles.tabActive]}
                  >
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
                    style={[styles.input, focused === "name" && styles.inputFocused]}
                    placeholder="Your name"
                    placeholderTextColor={Theme.textMuted}
                    value={displayName}
                    onChangeText={setDisplayName}
                    onFocus={() => setFocused("name")}
                    onBlur={() => setFocused(null)}
                  />
                  <Text style={styles.label}>Account type</Text>
                  <View style={styles.roleRow}>
                    {(["viewer", "creator"] as const).map((r) => (
                      <Pressable
                        key={r}
                        onPress={() => {
                          hapticLight();
                          setRole(r);
                        }}
                        style={[styles.roleChip, role === r && styles.roleChipActive]}
                      >
                        <Ionicons
                          name={r === "creator" ? "videocam" : "play-circle"}
                          size={15}
                          color={role === r ? Theme.accent : Theme.textMuted}
                        />
                        <Text style={[styles.roleText, role === r && styles.roleTextActive]}>{r}</Text>
                      </Pressable>
                    ))}
                  </View>
                </>
              )}

              <Text style={styles.label}>Email</Text>
              <TextInput
                style={[styles.input, focused === "email" && styles.inputFocused]}
                autoCapitalize="none"
                keyboardType="email-address"
                placeholder="you@example.com"
                placeholderTextColor={Theme.textMuted}
                value={email}
                onChangeText={setEmail}
                onFocus={() => setFocused("email")}
                onBlur={() => setFocused(null)}
              />

              <Text style={styles.label}>Password</Text>
              <View style={[styles.passWrap, focused === "pass" && styles.inputFocused]}>
                <TextInput
                  style={styles.passInput}
                  secureTextEntry={!showPass}
                  placeholder="Enter password"
                  placeholderTextColor={Theme.textMuted}
                  value={password}
                  onChangeText={setPassword}
                  onFocus={() => setFocused("pass")}
                  onBlur={() => setFocused(null)}
                />
                <Pressable onPress={() => setShowPass((s) => !s)} style={styles.eyeBtn}>
                  <Ionicons name={showPass ? "eye-off-outline" : "eye-outline"} size={18} color={Theme.textMuted} />
                </Pressable>
              </View>

              <GradientButton
                label={mode === "login" ? "Sign in" : "Create account"}
                onPress={handleSubmit}
                loading={busy}
                style={{ marginTop: 4 }}
              />

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
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Theme.bg },
  safe: { flex: 1 },
  container: { flexGrow: 1, justifyContent: "center", padding: 20, gap: 20 },
  brand: { alignItems: "center", marginBottom: 2 },
  logoRing: { padding: 3, borderRadius: 26, marginBottom: 12 },
  logoImg: { width: 78, height: 78, borderRadius: 23 },
  title: { color: Theme.text, fontSize: 31, fontWeight: "800", letterSpacing: -0.6 },
  subtitle: { color: Theme.textSecondary, fontSize: 13, marginTop: 4 },
  card: {
    backgroundColor: "rgba(18, 20, 31, 0.92)",
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    borderColor: Theme.border,
    gap: 12,
  },
  tabRow: { flexDirection: "row", backgroundColor: Theme.bg, borderRadius: 12, padding: 4, borderWidth: 1, borderColor: Theme.border },
  tab: { flex: 1, paddingVertical: 9, alignItems: "center", borderRadius: 9 },
  tabActive: { backgroundColor: Theme.surfaceElevated },
  tabText: { color: Theme.textMuted, fontWeight: "600", fontSize: 13 },
  tabTextActive: { color: Theme.text },
  label: { color: Theme.textSecondary, fontSize: 12, fontWeight: "600" },
  input: {
    backgroundColor: Theme.bg,
    borderWidth: 1,
    borderColor: Theme.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    color: Theme.text,
    fontSize: 14,
  },
  inputFocused: { borderColor: Theme.brand },
  passWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Theme.bg,
    borderWidth: 1,
    borderColor: Theme.border,
    borderRadius: 12,
  },
  passInput: { flex: 1, paddingHorizontal: 14, paddingVertical: 11, color: Theme.text, fontSize: 14 },
  eyeBtn: { paddingHorizontal: 12, paddingVertical: 10 },
  roleRow: { flexDirection: "row", gap: 8 },
  roleChip: {
    flex: 1,
    flexDirection: "row",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.bg,
  },
  roleChipActive: { backgroundColor: Theme.brandSoft, borderColor: Theme.brand },
  roleText: { color: Theme.textMuted, textTransform: "capitalize", fontWeight: "600", fontSize: 13 },
  roleTextActive: { color: Theme.text },
  dividerRow: { flexDirection: "row", alignItems: "center", gap: 10, marginVertical: 2 },
  divider: { flex: 1, height: 1, backgroundColor: Theme.border },
  dividerText: { color: Theme.textMuted, fontSize: 12 },
  secondaryBtn: {
    flexDirection: "row",
    gap: 8,
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Theme.borderStrong,
    backgroundColor: Theme.surfaceElevated,
  },
  secondaryBtnText: { color: Theme.text, fontWeight: "700", fontSize: 14 },
});
