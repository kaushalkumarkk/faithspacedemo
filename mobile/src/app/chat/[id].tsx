import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams } from "expo-router";
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
import { api, type Message, type User } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const otherId = Number(id);
  const { user: me } = useAuth();
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
          title: other?.display_name ?? "Chat",
          headerRight: () =>
            other ? (
              <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
                <Pressable onPress={() => { setReason(""); setReportTarget({ type: "user", id: other.id, label: other.display_name }); }}>
                  <Ionicons name="flag-outline" size={20} color="#fff" />
                </Pressable>
                <Pressable onPress={toggleBlock}>
                  <Ionicons name={other.is_blocked ? "shield-checkmark" : "ban"} size={20} color={other.is_blocked ? "#2ed573" : "#ff6b81"} />
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
        renderItem={({ item: m }) => {
          const mine = m.sender_id === me?.id;
          return (
            <View style={{ alignItems: mine ? "flex-end" : "flex-start" }}>
              <Pressable
                onLongPress={() => {
                  if (!mine) {
                    setReason("");
                    setReportTarget({ type: "message", id: m.id, label: "this message" });
                  }
                }}
                style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}
              >
                <Text style={styles.bubbleText}>{m.body}</Text>
              </Pressable>
              {mine && m.id === lastMineId && (
                <Text style={styles.receipt}>{m.read_at ? "Seen" : "Sent"}</Text>
              )}
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
            placeholderTextColor="#7c7b8a"
            value={text}
            onChangeText={setText}
          />
          <Pressable style={styles.sendBtn} onPress={send}>
            <Ionicons name="send" size={18} color="#fff" />
          </Pressable>
        </View>
      )}

      <Modal visible={!!reportTarget} animationType="fade" transparent onRequestClose={() => setReportTarget(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.dialog}>
            <Text style={styles.modalTitle}>Report {reportTarget?.label}</Text>
            <TextInput
              style={styles.reasonInput}
              multiline
              placeholder="Describe the issue..."
              placeholderTextColor="#7c7b8a"
              value={reason}
              onChangeText={setReason}
            />
            <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 10 }}>
              <Pressable onPress={() => setReportTarget(null)} style={{ padding: 10 }}>
                <Text style={{ color: "#ccc" }}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.sendBtn} onPress={sendReport}>
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
  screen: { flex: 1, backgroundColor: "#0d0c12" },
  bubble: { maxWidth: "80%", borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10 },
  bubbleMine: { backgroundColor: "#7c5cff", borderBottomRightRadius: 4 },
  bubbleTheirs: { backgroundColor: "#222030", borderBottomLeftRadius: 4 },
  bubbleText: { color: "#fff", fontSize: 15 },
  receipt: { color: "#8f8da0", fontSize: 10, marginTop: 3 },
  composer: { flexDirection: "row", gap: 8, padding: 10, borderTopWidth: 1, borderTopColor: "#282638", backgroundColor: "#14131c" },
  input: { flex: 1, backgroundColor: "#0d0c12", color: "#fff", borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: "#2f2d42" },
  sendBtn: { backgroundColor: "#7c5cff", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, justifyContent: "center", alignItems: "center" },
  blockedBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 12, borderTopWidth: 1, borderTopColor: "#282638", backgroundColor: "#1d1826" },
  blockedText: { color: "#ff8c9b", fontSize: 12, flex: 1 },
  unblockBtn: { backgroundColor: "#2d2a40", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  unblockText: { color: "#fff", fontWeight: "700", fontSize: 12 },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.65)", justifyContent: "center", padding: 20 },
  dialog: { backgroundColor: "#171622", borderRadius: 16, padding: 16, gap: 12, borderWidth: 1, borderColor: "#2f2d42" },
  modalTitle: { color: "#fff", fontSize: 16, fontWeight: "700" },
  reasonInput: { backgroundColor: "#0d0c12", color: "#fff", borderRadius: 10, padding: 12, minHeight: 80, textAlignVertical: "top", borderWidth: 1, borderColor: "#2f2d42" },
});
