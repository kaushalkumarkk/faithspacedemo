import { Image } from "expo-image";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { api, formatTime, mediaSrc, type User, type Video } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export default function ProfileScreen() {
  const { user, apiUrl, logout } = useAuth();
  const router = useRouter();
  const [myVideos, setMyVideos] = useState<Video[]>([]);
  const [blocked, setBlocked] = useState<User[]>([]);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const [vids, blks] = await Promise.all([
        user.role !== "viewer" ? api<Video[]>("/videos/mine") : Promise.resolve([]),
        api<User[]>("/users/blocks"),
      ]);
      setMyVideos(vids);
      setBlocked(blks);
    } catch {}
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const unblock = async (uid: number) => {
    try {
      await api(`/users/${uid}/block`, { method: "DELETE" });
      await load();
    } catch (e) {
      Alert.alert("Error", (e as Error).message);
    }
  };

  const deleteOwnVideo = async (vid: Video) => {
    Alert.alert("Delete video", `Delete "${vid.title}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await api(`/videos/${vid.id}`, { method: "DELETE" });
            await load();
          } catch (e) {
            Alert.alert("Error", (e as Error).message);
          }
        },
      },
    ]);
  };

  if (!user) return null;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <View style={styles.card}>
        <View style={styles.headerRow}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{user.display_name.slice(0, 1).toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{user.display_name}</Text>
            <Text style={styles.meta}>
              {user.role.toUpperCase()} · {user.email}
            </Text>
            <Text style={styles.meta}>API: {apiUrl}</Text>
          </View>
        </View>
        <Pressable
          style={styles.logoutBtn}
          onPress={async () => {
            await logout();
            router.replace("/login");
          }}
        >
          <Text style={styles.logoutText}>Switch account / Log out</Text>
        </Pressable>
      </View>

      {blocked.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.section}>Blocked users</Text>
          {blocked.map((b) => (
            <View key={b.id} style={styles.row}>
              <Text style={styles.rowTitle}>{b.display_name}</Text>
              <Pressable style={styles.smallBtn} onPress={() => unblock(b.id)}>
                <Text style={styles.smallBtnText}>Unblock</Text>
              </Pressable>
            </View>
          ))}
        </View>
      )}

      {user.role !== "viewer" && (
        <View style={styles.card}>
          <Text style={styles.section}>My studio ({myVideos.length})</Text>
          {myVideos.length === 0 && <Text style={styles.empty}>No uploads yet.</Text>}
          {myVideos.map((v) => {
            const thumb = mediaSrc(v.thumbnail_url, v.status);
            return (
              <View key={v.id} style={styles.videoRow}>
                {thumb ? (
                  <Image source={{ uri: thumb }} style={styles.thumb} contentFit="cover" />
                ) : (
                  <View style={[styles.thumb, { backgroundColor: "#000" }]} />
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{v.title}</Text>
                  <Text style={styles.meta}>
                    {v.status} {v.duration_seconds != null ? `· ${formatTime(v.duration_seconds)}` : ""}
                  </Text>
                  {!!v.rejection_reason && <Text style={styles.reject}>Reason: {v.rejection_reason}</Text>}
                </View>
                <Pressable style={styles.delBtn} onPress={() => deleteOwnVideo(v)}>
                  <Text style={styles.delText}>Delete</Text>
                </Pressable>
              </View>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#0d0c12" },
  container: { padding: 14, gap: 14 },
  card: { backgroundColor: "#171622", borderRadius: 16, padding: 14, borderWidth: 1, borderColor: "#282638", gap: 10 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: "#7c5cff", alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#fff", fontSize: 20, fontWeight: "800" },
  name: { color: "#fff", fontSize: 18, fontWeight: "700" },
  meta: { color: "#9c9aa8", fontSize: 12, marginTop: 2 },
  logoutBtn: { backgroundColor: "#252336", paddingVertical: 11, borderRadius: 10, alignItems: "center", borderWidth: 1, borderColor: "#373452" },
  logoutText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  section: { color: "#fff", fontSize: 15, fontWeight: "700" },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 6 },
  videoRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 6, borderTopWidth: 1, borderTopColor: "#252336" },
  thumb: { width: 44, height: 64, borderRadius: 8 },
  rowTitle: { color: "#fff", fontWeight: "600", fontSize: 14 },
  reject: { color: "#ff6b81", fontSize: 12, marginTop: 2 },
  smallBtn: { backgroundColor: "#2d2a40", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  smallBtnText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  delBtn: { backgroundColor: "#3a1b24", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  delText: { color: "#ff6b81", fontSize: 12, fontWeight: "700" },
  empty: { color: "#8f8da0", fontSize: 13 },
});
