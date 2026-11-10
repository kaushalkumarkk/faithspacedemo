import { Image } from "expo-image";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { api, formatTime, mediaSrc, type Page, type User, type Video } from "@/lib/api";

export default function UserProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
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
        <Text style={styles.name}>{profile.display_name}</Text>
        <Text style={styles.role}>{profile.role}</Text>
        {!!profile.bio && <Text style={styles.bio}>{profile.bio}</Text>}
        <Text style={styles.stats}>
          {profile.follower_count} followers · {profile.following_count} following · {profile.video_count} videos
        </Text>
        <View style={styles.actions}>
          {!profile.is_blocked && !profile.blocked_by_target && (
            <>
              <Pressable style={styles.primaryBtn} onPress={toggleFollow}>
                <Text style={styles.btnText}>{profile.is_following ? "Following" : "Follow"}</Text>
              </Pressable>
              <Pressable style={styles.secBtn} onPress={() => router.push(`/chat/${profile.id}`)}>
                <Text style={styles.btnText}>Message</Text>
              </Pressable>
            </>
          )}
          <Pressable style={styles.dangerBtn} onPress={toggleBlock}>
            <Text style={styles.dangerText}>{profile.is_blocked ? "Unblock" : "Block"}</Text>
          </Pressable>
          <Pressable style={styles.secBtn} onPress={() => { setReason(""); setReportOpen(true); }}>
            <Text style={styles.btnText}>Report</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.grid}>
        {videos.map((v) => {
          const thumb = mediaSrc(v.thumbnail_url, v.status);
          return (
            <View key={v.id} style={styles.gridItem}>
              {thumb ? <Image source={{ uri: thumb }} style={styles.gridImg} contentFit="cover" /> : <View style={styles.gridImg} />}
              {v.duration_seconds != null && <Text style={styles.dur}>{formatTime(v.duration_seconds)}</Text>}
              <Text style={styles.gridTitle} numberOfLines={1}>{v.title}</Text>
            </View>
          );
        })}
      </View>

      <Modal visible={reportOpen} transparent animationType="fade" onRequestClose={() => setReportOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.dialog}>
            <Text style={styles.name}>Report {profile.display_name}</Text>
            <TextInput
              style={styles.input}
              multiline
              placeholder="Reason..."
              placeholderTextColor="#7c7b8a"
              value={reason}
              onChangeText={setReason}
            />
            <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 10 }}>
              <Pressable onPress={() => setReportOpen(false)} style={{ padding: 10 }}><Text style={{ color: "#ccc" }}>Cancel</Text></Pressable>
              <Pressable style={styles.primaryBtn} onPress={sendReport}><Text style={styles.btnText}>Send</Text></Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#0d0c12" },
  container: { padding: 14, gap: 14 },
  card: { backgroundColor: "#171622", borderRadius: 16, padding: 14, borderWidth: 1, borderColor: "#282638", gap: 8 },
  name: { color: "#fff", fontSize: 20, fontWeight: "700" },
  role: { color: "#9c9aa8", fontSize: 12, textTransform: "uppercase" },
  bio: { color: "#d5d4df", fontSize: 14 },
  stats: { color: "#c9c8d4", fontSize: 13 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
  primaryBtn: { backgroundColor: "#7c5cff", paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10 },
  secBtn: { backgroundColor: "#252336", paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10 },
  dangerBtn: { backgroundColor: "#3a1b24", paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10 },
  btnText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  dangerText: { color: "#ff6b81", fontWeight: "700", fontSize: 13 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  gridItem: { width: "48%", aspectRatio: 9 / 16, borderRadius: 12, overflow: "hidden", backgroundColor: "#000", position: "relative" },
  gridImg: { width: "100%", height: "100%", backgroundColor: "#171622" },
  dur: { position: "absolute", top: 6, right: 6, backgroundColor: "rgba(0,0,0,0.7)", color: "#fff", fontSize: 10, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  gridTitle: { position: "absolute", left: 6, right: 6, bottom: 6, color: "#fff", fontSize: 12, fontWeight: "700", backgroundColor: "rgba(0,0,0,0.55)", padding: 4, borderRadius: 6 },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.65)", justifyContent: "center", padding: 20 },
  dialog: { backgroundColor: "#171622", borderRadius: 16, padding: 16, gap: 12, borderWidth: 1, borderColor: "#2f2d42" },
  input: { backgroundColor: "#0d0c12", color: "#fff", borderRadius: 10, padding: 12, minHeight: 80, textAlignVertical: "top", borderWidth: 1, borderColor: "#2f2d42" },
});
