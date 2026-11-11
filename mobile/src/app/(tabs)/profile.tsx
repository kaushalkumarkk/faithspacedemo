import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { api, formatTime, mediaSrc, type User, type Video } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { statusColors, Theme } from "@/lib/theme";

export default function ProfileScreen() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [myVideos, setMyVideos] = useState<Video[]>([]);
  const [savedVideos, setSavedVideos] = useState<Video[]>([]);
  const [blocked, setBlocked] = useState<User[]>([]);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const [vids, saved, blks] = await Promise.all([
        user.role !== "viewer" ? api<Video[]>("/videos/mine") : Promise.resolve([]),
        api<Video[]>("/videos/saved"),
        user.is_guest ? Promise.resolve([]) : api<User[]>("/users/blocks"),
      ]);
      setMyVideos(vids);
      setSavedVideos(saved);
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

  const unsave = async (vidId: number) => {
    try {
      await api(`/videos/${vidId}/save`, { method: "DELETE" });
      setSavedVideos((prev) => prev.filter((v) => v.id !== vidId));
    } catch (e) {
      Alert.alert("Error", (e as Error).message);
    }
  };

  const deleteOwnVideo = (vid: Video) => {
    Alert.alert("Delete video", `Delete "${vid.title}" permanently?`, [
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
            <View style={styles.badgeRow}>
              <View style={styles.rolePill}>
                <Text style={styles.roleText}>{user.is_guest ? "GUEST" : user.role.toUpperCase()}</Text>
              </View>
              {!user.is_guest && !!user.email && <Text style={styles.meta}>{user.email}</Text>}
            </View>
          </View>
        </View>

        <View style={styles.statRow}>
          <View style={styles.statBox}>
            <Text style={styles.statNum}>{user.follower_count ?? 0}</Text>
            <Text style={styles.statLabel}>Followers</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statNum}>{user.following_count ?? 0}</Text>
            <Text style={styles.statLabel}>Following</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statNum}>{savedVideos.length}</Text>
            <Text style={styles.statLabel}>Saved</Text>
          </View>
        </View>

        <Pressable
          style={styles.logoutBtn}
          onPress={async () => {
            await logout();
            router.replace("/login");
          }}
        >
          <Ionicons name="log-out-outline" size={16} color={Theme.text} />
          <Text style={styles.logoutText}>{user.is_guest ? "Sign in or create account" : "Switch account / Log out"}</Text>
        </Pressable>
      </View>

      {blocked.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.section}>Blocked users ({blocked.length})</Text>
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

      <View style={styles.card}>
        <Text style={styles.section}>Saved videos ({savedVideos.length})</Text>
        {savedVideos.length === 0 ? (
          <Text style={styles.empty}>Bookmark any video in the Watch feed to keep it here.</Text>
        ) : (
          savedVideos.map((v) => {
            const thumb = mediaSrc(v.thumbnail_url, v.status);
            return (
              <View key={v.id} style={styles.videoRow}>
                {thumb ? (
                  <Image source={{ uri: thumb }} style={styles.thumb} contentFit="cover" />
                ) : (
                  <View style={[styles.thumb, { backgroundColor: "#000" }]} />
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle} numberOfLines={1}>{v.title}</Text>
                  <Text style={styles.meta}>
                    {v.owner.display_name} {v.duration_seconds != null ? `· ${formatTime(v.duration_seconds)}` : ""}
                  </Text>
                </View>
                <Pressable style={styles.smallBtn} onPress={() => unsave(v.id)}>
                  <Text style={styles.smallBtnText}>Remove</Text>
                </Pressable>
              </View>
            );
          })
        )}
      </View>

      {user.role !== "viewer" && (
        <View style={styles.card}>
          <Text style={styles.section}>My studio ({myVideos.length})</Text>
          {myVideos.length === 0 && <Text style={styles.empty}>No uploads yet.</Text>}
          {myVideos.map((v) => {
            const thumb = mediaSrc(v.thumbnail_url, v.status);
            const sc = statusColors(v.status);
            return (
              <View key={v.id} style={styles.videoRow}>
                {thumb ? (
                  <Image source={{ uri: thumb }} style={styles.thumb} contentFit="cover" />
                ) : (
                  <View style={[styles.thumb, { backgroundColor: "#000" }]} />
                )}
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={styles.rowTitle} numberOfLines={1}>{v.title}</Text>
                  <View style={styles.badgeRow}>
                    <View style={[styles.statusBadge, { backgroundColor: sc.bg }]}>
                      <Text style={[styles.statusText, { color: sc.fg }]}>{v.status}</Text>
                    </View>
                    {v.duration_seconds != null && <Text style={styles.meta}>{formatTime(v.duration_seconds)}</Text>}
                    <Text style={styles.meta}>· {v.view_count ?? 0} views</Text>
                  </View>
                  {!!v.rejection_reason && <Text style={styles.reject}>Reason: {v.rejection_reason}</Text>}
                </View>
                <Pressable style={styles.delBtn} onPress={() => deleteOwnVideo(v)}>
                  <Ionicons name="trash-outline" size={16} color={Theme.danger} />
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
  screen: { flex: 1, backgroundColor: Theme.bg },
  container: { padding: 14, gap: 14 },
  card: { backgroundColor: Theme.surface, borderRadius: 18, padding: 14, borderWidth: 1, borderColor: Theme.border, gap: 12 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: Theme.brand, alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#fff", fontSize: 22, fontWeight: "800" },
  name: { color: Theme.text, fontSize: 19, fontWeight: "700" },
  badgeRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 3, flexWrap: "wrap" },
  rolePill: { backgroundColor: Theme.brandSoft, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  roleText: { color: Theme.brand, fontSize: 10, fontWeight: "800" },
  meta: { color: Theme.textMuted, fontSize: 12 },
  statRow: { flexDirection: "row", gap: 8 },
  statBox: { flex: 1, backgroundColor: Theme.bg, borderRadius: 12, paddingVertical: 10, alignItems: "center", borderWidth: 1, borderColor: Theme.border },
  statNum: { color: Theme.text, fontSize: 17, fontWeight: "800" },
  statLabel: { color: Theme.textMuted, fontSize: 11, marginTop: 2 },
  logoutBtn: { flexDirection: "row", gap: 8, backgroundColor: Theme.surfaceElevated, paddingVertical: 12, borderRadius: 12, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: Theme.borderStrong },
  logoutText: { color: Theme.text, fontWeight: "700", fontSize: 13 },
  section: { color: Theme.text, fontSize: 15, fontWeight: "700" },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 6 },
  videoRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: Theme.border },
  thumb: { width: 46, height: 66, borderRadius: 10 },
  rowTitle: { color: Theme.text, fontWeight: "600", fontSize: 14 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  statusText: { fontSize: 11, fontWeight: "700", textTransform: "capitalize" },
  reject: { color: Theme.danger, fontSize: 12, marginTop: 2 },
  smallBtn: { backgroundColor: Theme.surfaceElevated, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: Theme.border },
  smallBtnText: { color: Theme.text, fontSize: 12, fontWeight: "700" },
  delBtn: { backgroundColor: Theme.dangerSoft, padding: 9, borderRadius: 10 },
  empty: { color: Theme.textMuted, fontSize: 13 },
});
