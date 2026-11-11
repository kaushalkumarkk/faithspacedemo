import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { api, formatTime, mediaSrc, type Page, type User, type Video } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Theme } from "@/lib/theme";

const USER_REPORT_REASONS = ["Harassment", "Spam account", "Impersonation", "Inappropriate content"];

export default function UserProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user: me } = useAuth();
  const router = useRouter();
  const [profile, setProfile] = useState<User | null>(null);
  const [videos, setVideos] = useState<Video[]>([]);
  const [reportOpen, setReportOpen] = useState(false);
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    try {
      const [u, vids] = await Promise.all([
        api<User>(`/users/${id}`),
        api<Page<Video>>(`/videos?owner_id=${id}&page_size=24`),
      ]);
      setProfile(u);
      setVideos(vids.items);
    } catch {}
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleFollow = async () => {
    if (!profile) return;
    try {
      setProfile(await api<User>(`/users/${profile.id}/follow`, { method: profile.is_following ? "DELETE" : "POST" }));
    } catch (e) {
      Alert.alert("Error", (e as Error).message);
    }
  };

  const toggleBlock = async () => {
    if (!profile) return;
    try {
      const updated = await api<User>(`/users/${profile.id}/block`, { method: profile.is_blocked ? "DELETE" : "POST" });
      setProfile(updated);
      await load();
    } catch (e) {
      Alert.alert("Error", (e as Error).message);
    }
  };

  const sendReport = async () => {
    if (!profile || reason.trim().length < 3) return;
    try {
      await api("/reports", { method: "POST", json: { target_type: "user", target_id: profile.id, reason: reason.trim() } });
      setReportOpen(false);
      setReason("");
      Alert.alert("Reported", "User reported to moderators.");
    } catch (e) {
      Alert.alert("Error", (e as Error).message);
    }
  };

  if (!profile) return <View style={styles.screen} />;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <Stack.Screen options={{ title: profile.display_name }} />
      <View style={styles.card}>
        <View style={styles.topRow}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{profile.display_name.slice(0, 1).toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{profile.display_name}</Text>
            <Text style={styles.role}>{profile.role}</Text>
          </View>
        </View>
        {!!profile.bio && <Text style={styles.bio}>{profile.bio}</Text>}

        <View style={styles.statRow}>
          <View style={styles.statBox}>
            <Text style={styles.statNum}>{profile.follower_count}</Text>
            <Text style={styles.statLabel}>Followers</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statNum}>{profile.following_count}</Text>
            <Text style={styles.statLabel}>Following</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statNum}>{profile.video_count}</Text>
            <Text style={styles.statLabel}>Videos</Text>
          </View>
        </View>

        {!me?.is_guest && me?.id !== profile.id && (
          <View style={styles.actions}>
            {!profile.is_blocked && !profile.blocked_by_target && (
              <>
                <Pressable style={styles.primaryBtn} onPress={toggleFollow}>
                  <Text style={styles.btnText}>{profile.is_following ? "Following" : "Follow"}</Text>
                </Pressable>
                <Pressable style={styles.secBtn} onPress={() => router.push(`/chat/${profile.id}`)}>
                  <Ionicons name="chatbubble-outline" size={14} color={Theme.text} />
                  <Text style={styles.btnText}>Message</Text>
                </Pressable>
              </>
            )}
            <Pressable style={styles.dangerBtn} onPress={toggleBlock}>
              <Text style={styles.dangerText}>{profile.is_blocked ? "Unblock" : "Block"}</Text>
            </Pressable>
            <Pressable style={styles.secBtn} onPress={() => { setReason(""); setReportOpen(true); }}>
              <Ionicons name="flag-outline" size={14} color={Theme.text} />
              <Text style={styles.btnText}>Report</Text>
            </Pressable>
          </View>
        )}
      </View>

      <View style={styles.grid}>
        {videos.map((v) => {
          const thumb = mediaSrc(v.thumbnail_url, v.status);
          return (
            <View key={v.id} style={styles.gridItem}>
              {thumb ? <Image source={{ uri: thumb }} style={styles.gridImg} contentFit="cover" /> : <View style={styles.gridImg} />}
              {v.duration_seconds != null && <Text style={styles.dur}>{formatTime(v.duration_seconds)}</Text>}
              <View style={styles.gridCaption}>
                <Text style={styles.gridTitle} numberOfLines={1}>{v.title}</Text>
                <Text style={styles.gridMeta}>{v.view_count ?? 0} views</Text>
              </View>
            </View>
          );
        })}
      </View>

      <Modal visible={reportOpen} transparent animationType="fade" onRequestClose={() => setReportOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.dialog}>
            <Text style={styles.name}>Report {profile.display_name}</Text>
            <View style={styles.chipWrap}>
              {USER_REPORT_REASONS.map((r) => (
                <Pressable key={r} onPress={() => setReason(r)} style={[styles.chip, reason === r && styles.chipActive]}>
                  <Text style={[styles.chipText, reason === r && { color: Theme.text }]}>{r}</Text>
                </Pressable>
              ))}
            </View>
            <TextInput
              style={styles.input}
              multiline
              placeholder="Reason..."
              placeholderTextColor={Theme.textMuted}
              value={reason}
              onChangeText={setReason}
            />
            <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 10 }}>
              <Pressable onPress={() => setReportOpen(false)} style={{ padding: 10 }}><Text style={{ color: Theme.textSecondary }}>Cancel</Text></Pressable>
              <Pressable style={[styles.primaryBtn, reason.trim().length < 3 && { opacity: 0.5 }]} disabled={reason.trim().length < 3} onPress={sendReport}><Text style={styles.btnText}>Send</Text></Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Theme.bg },
  container: { padding: 14, gap: 14 },
  card: { backgroundColor: Theme.surface, borderRadius: 18, padding: 14, borderWidth: 1, borderColor: Theme.border, gap: 12 },
  topRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: { width: 54, height: 54, borderRadius: 27, backgroundColor: Theme.brand, alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#fff", fontSize: 20, fontWeight: "800" },
  name: { color: Theme.text, fontSize: 20, fontWeight: "700" },
  role: { color: Theme.textMuted, fontSize: 12, textTransform: "uppercase", marginTop: 2 },
  bio: { color: Theme.textSecondary, fontSize: 14 },
  statRow: { flexDirection: "row", gap: 8 },
  statBox: { flex: 1, backgroundColor: Theme.bg, borderRadius: 12, paddingVertical: 10, alignItems: "center", borderWidth: 1, borderColor: Theme.border },
  statNum: { color: Theme.text, fontSize: 16, fontWeight: "800" },
  statLabel: { color: Theme.textMuted, fontSize: 11, marginTop: 2 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  primaryBtn: { backgroundColor: Theme.brand, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10 },
  secBtn: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: Theme.surfaceElevated, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10, borderWidth: 1, borderColor: Theme.border },
  dangerBtn: { backgroundColor: Theme.dangerSoft, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10 },
  btnText: { color: Theme.text, fontWeight: "700", fontSize: 13 },
  dangerText: { color: Theme.danger, fontWeight: "700", fontSize: 13 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  gridItem: { width: "48%", aspectRatio: 9 / 16, borderRadius: 14, overflow: "hidden", backgroundColor: "#000", position: "relative" },
  gridImg: { width: "100%", height: "100%", backgroundColor: Theme.surface },
  dur: { position: "absolute", top: 6, right: 6, backgroundColor: "rgba(0,0,0,0.72)", color: "#fff", fontSize: 10, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, fontWeight: "700" },
  gridCaption: { position: "absolute", left: 0, right: 0, bottom: 0, padding: 8, backgroundColor: "rgba(0,0,0,0.6)" },
  gridTitle: { color: "#fff", fontSize: 12, fontWeight: "700" },
  gridMeta: { color: Theme.textSecondary, fontSize: 10, marginTop: 1 },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "center", padding: 20 },
  dialog: { backgroundColor: Theme.surface, borderRadius: 20, padding: 18, gap: 12, borderWidth: 1, borderColor: Theme.border },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, backgroundColor: Theme.bg, borderWidth: 1, borderColor: Theme.border },
  chipActive: { backgroundColor: Theme.brandSoft, borderColor: Theme.brand },
  chipText: { color: Theme.textMuted, fontSize: 12, fontWeight: "600" },
  input: { backgroundColor: Theme.bg, color: Theme.text, borderRadius: 12, padding: 12, minHeight: 80, textAlignVertical: "top", borderWidth: 1, borderColor: Theme.border },
});
