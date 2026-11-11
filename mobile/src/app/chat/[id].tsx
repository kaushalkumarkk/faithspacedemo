import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { GradientAvatar, hapticLight, hapticSuccess } from "@/components/ui";
import { api, timeAgo, type Message, type User } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Theme } from "@/lib/theme";

const CHAT_REPORT_REASONS = ["Harassment", "Spam", "Inappropriate message", "Safety concern"];

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const otherId = Number(id);
  const { user: me } = useAuth();
  const router = useRouter();
  const listRef = useRef<FlatList<Message>>(null);

  const [other, setOther] = useState<User | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [reportTarget, setReportTarget] = useState<{ type: "user" | "message"; id: number; label: string } | null>(null);
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    try {
      const [u, thread] = await Promise.all([
        api<User>(`/users/${otherId}`),
        api<Message[]>(`/messages/with/${otherId}`),
      ]);
      setOther(u);
      setMessages(thread);
    } catch {}
  }, [otherId]);

  useEffect(() => {
    load();
    const timer = setInterval(load, 3000);
    return () => clearInterval(timer);
  }, [load]);

  const send = async () => {
    const body = text.trim();
    if (!body) return;
    hapticLight();
    setText("");
    try {
      await api<Message>(`/messages/with/${otherId}`, { method: "POST", json: { body } });
      await load();
      listRef.current?.scrollToEnd({ animated: true });
    } catch (e) {
      Alert.alert("Cannot send", (e as Error).message);
    }
  };

  const toggleBlock = async () => {
    if (!other) return;
    hapticLight();
    try {
      const updated = await api<User>(`/users/${other.id}/block`, {
        method: other.is_blocked ? "DELETE" : "POST",
      });
      setOther(updated);
      Alert.alert(updated.is_blocked ? "Blocked" : "Unblocked", `${other.display_name} has been ${updated.is_blocked ? "blocked" : "unblocked"}.`);
    } catch (e) {
      Alert.alert("Error", (e as Error).message);
    }
  };

  const sendReport = async () => {
    if (!reportTarget || reason.trim().length < 3) return;
    try {
      await api("/reports", {
        method: "POST",
        json: { target_type: reportTarget.type, target_id: reportTarget.id, reason: reason.trim() },
      });
      hapticSuccess();
      setReportTarget(null);
      setReason("");
      Alert.alert("Reported", "Report sent to moderators.");
    } catch (e) {
      Alert.alert("Error", (e as Error).message);
    }
  };

  const blocked = Boolean(other?.is_blocked || other?.blocked_by_target);
  const lastMineId = [...messages].reverse().find((m) => m.sender_id === me?.id)?.id;

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={90}
    >
      <Stack.Screen
        options={{
          title: "",
          headerLeft: () =>
            other ? (
              <Pressable onPress={() => router.push(`/user/${other.id}`)} style={styles.headerUser}>
                <GradientAvatar name={other.display_name} url={other.avatar_url} size={32} />
                <View>
                  <Text style={styles.headerName}>{other.display_name}</Text>
                  <Text style={styles.headerRole}>{other.is_blocked ? "Blocked" : other.role}</Text>
                </View>
              </Pressable>
            ) : null,
          headerRight: () =>
            other ? (
              <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
                <Pressable
                  style={styles.headerIconBtn}
                  onPress={() => { setReason(""); setReportTarget({ type: "user", id: other.id, label: other.display_name }); }}
                >
                  <Ionicons name="flag-outline" size={18} color={Theme.text} />
                </Pressable>
                <Pressable style={styles.headerIconBtn} onPress={toggleBlock}>
                  <Ionicons name={other.is_blocked ? "shield-checkmark" : "ban"} size={18} color={other.is_blocked ? Theme.success : Theme.danger} />
                </Pressable>
              </View>
            ) : null,
        }}
      />

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m) => String(m.id)}
        contentContainerStyle={{ padding: 14, gap: 10 }}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        ListEmptyComponent={<Text style={styles.empty}>No messages yet. Say hello! Long-press a received message to report it.</Text>}
        renderItem={({ item: m }) => {
          const mine = m.sender_id === me?.id;
          return (
            <View style={{ alignItems: mine ? "flex-end" : "flex-start" }}>
              {mine ? (
                <LinearGradient
                  colors={["#7C5CFF", "#4F6BFF"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[styles.bubble, styles.bubbleMine]}
                >
                  <Text style={styles.bubbleText}>{m.body}</Text>
                </LinearGradient>
              ) : (
                <Pressable
                  onLongPress={() => {
                    hapticLight();
                    setReason("");
                    setReportTarget({ type: "message", id: m.id, label: "this message" });
                  }}
                  style={[styles.bubble, styles.bubbleTheirs]}
                >
                  <Text style={styles.bubbleText}>{m.body}</Text>
                </Pressable>
              )}
              <View style={styles.metaRow}>
                <Text style={styles.metaText}>{timeAgo(m.created_at)}</Text>
                {mine && m.id === lastMineId && (
                  <View style={styles.receiptRow}>
                    <Ionicons
                      name={m.read_at ? "checkmark-done" : "checkmark"}
                      size={13}
                      color={m.read_at ? Theme.accent : Theme.textMuted}
                    />
                    <Text style={[styles.metaText, m.read_at && { color: Theme.accent }]}>
                      {m.read_at ? "Seen" : "Sent"}
                    </Text>
                  </View>
                )}
              </View>
            </View>
          );
        }}
      />

      {blocked ? (
        <View style={styles.blockedBar}>
          <Text style={styles.blockedText}>
            {other?.is_blocked ? `You blocked ${other.display_name}.` : "Messaging disabled (blocked)."}
          </Text>
          {other?.is_blocked && (
            <Pressable style={styles.unblockBtn} onPress={toggleBlock}>
              <Text style={styles.unblockText}>Unblock</Text>
            </Pressable>
          )}
        </View>
      ) : (
        <View style={styles.composer}>
          <TextInput
            style={styles.input}
            placeholder="Write a message..."
            placeholderTextColor={Theme.textMuted}
            value={text}
            onChangeText={setText}
          />
          <Pressable style={[styles.sendBtn, !text.trim() && { opacity: 0.5 }]} onPress={send} disabled={!text.trim()}>
            <Ionicons name="send" size={18} color="#fff" />
          </Pressable>
        </View>
      )}

      <Modal visible={!!reportTarget} animationType="fade" transparent onRequestClose={() => setReportTarget(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.dialog}>
            <Text style={styles.modalTitle}>Report {reportTarget?.label}</Text>
            <View style={styles.chipWrap}>
              {CHAT_REPORT_REASONS.map((r) => (
                <Pressable key={r} onPress={() => setReason(r)} style={[styles.chip, reason === r && styles.chipActive]}>
                  <Text style={[styles.chipText, reason === r && { color: Theme.text }]}>{r}</Text>
                </Pressable>
              ))}
            </View>
            <TextInput
              style={styles.reasonInput}
              multiline
              placeholder="Describe the issue..."
              placeholderTextColor={Theme.textMuted}
              value={reason}
              onChangeText={setReason}
            />
            <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 10 }}>
              <Pressable onPress={() => setReportTarget(null)} style={{ padding: 10 }}>
                <Text style={{ color: Theme.textSecondary }}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.sendBtn, reason.trim().length < 3 && { opacity: 0.5 }]}
                disabled={reason.trim().length < 3}
                onPress={sendReport}
              >
                <Text style={{ color: "#fff", fontWeight: "700" }}>Send</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Theme.bg },
  headerUser: { flexDirection: "row", alignItems: "center", gap: 10 },
  headerName: { color: Theme.text, fontWeight: "700", fontSize: 15 },
  headerRole: { color: Theme.textMuted, fontSize: 11, textTransform: "capitalize" },
  headerIconBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: Theme.surfaceElevated, alignItems: "center", justifyContent: "center" },
  empty: { color: Theme.textMuted, textAlign: "center", marginTop: 40, fontSize: 13, paddingHorizontal: 24 },
  bubble: { maxWidth: "82%", borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10 },
  bubbleMine: { borderBottomRightRadius: 4 },
  bubbleTheirs: { backgroundColor: Theme.surfaceElevated, borderBottomLeftRadius: 4, borderWidth: 1, borderColor: Theme.border },
  bubbleText: { color: "#fff", fontSize: 15, lineHeight: 20 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 3 },
  receiptRow: { flexDirection: "row", alignItems: "center", gap: 2 },
  metaText: { color: Theme.textMuted, fontSize: 10 },
  composer: { flexDirection: "row", gap: 8, padding: 10, borderTopWidth: 1, borderTopColor: Theme.border, backgroundColor: Theme.surface },
  input: { flex: 1, backgroundColor: Theme.bg, color: Theme.text, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: Theme.border },
  sendBtn: { backgroundColor: Theme.brand, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, justifyContent: "center", alignItems: "center" },
  blockedBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 12, borderTopWidth: 1, borderTopColor: Theme.border, backgroundColor: Theme.dangerSoft },
  blockedText: { color: Theme.danger, fontSize: 12, flex: 1, fontWeight: "600" },
  unblockBtn: { backgroundColor: Theme.surfaceElevated, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  unblockText: { color: Theme.text, fontWeight: "700", fontSize: 12 },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "center", padding: 20 },
  dialog: { backgroundColor: Theme.surface, borderRadius: 20, padding: 18, gap: 12, borderWidth: 1, borderColor: Theme.border },
  modalTitle: { color: Theme.text, fontSize: 16, fontWeight: "700" },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, backgroundColor: Theme.bg, borderWidth: 1, borderColor: Theme.border },
  chipActive: { backgroundColor: Theme.brandSoft, borderColor: Theme.brand },
  chipText: { color: Theme.textMuted, fontSize: 12, fontWeight: "600" },
  reasonInput: { backgroundColor: Theme.bg, color: Theme.text, borderRadius: 12, padding: 12, minHeight: 80, textAlignVertical: "top", borderWidth: 1, borderColor: Theme.border },
});
