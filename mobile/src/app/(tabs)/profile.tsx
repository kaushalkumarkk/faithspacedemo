import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { EmptyView, GradientAvatar, GradientButton, hapticLight, hapticSuccess } from "@/components/ui";
import { api, formatTime, mediaSrc, uploadMediaFile, type User, type Video } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { statusColors, Theme } from "@/lib/theme";

export default function ProfileScreen() {
  const { user, logout, refresh } = useAuth();
  const router = useRouter();
  const [section, setSection] = useState<"studio" | "saved" | "blocked">(user?.role === "viewer" ? "saved" : "studio");
  const [myVideos, setMyVideos] = useState<Video[]>([]);
  const [savedVideos, setSavedVideos] = useState<Video[]>([]);
  const [blocked, setBlocked] = useState<User[]>([]);
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editBio, setEditBio] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

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

  const changeAvatar = async () => {
    if (!user || user.is_guest) return;
    hapticLight();
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.85 });
    if (res.canceled || !res.assets[0]) return;
    try {
      const a = res.assets[0];
      const name = a.fileName || "avatar.jpg";
      const mime = a.mimeType || "image/jpeg";
      const asset = await uploadMediaFile("image", a.uri, name, mime).promise;
      await api("/users/me", { method: "PATCH", json: { avatar_asset_id: asset.id } });
      await refresh();
      hapticSuccess();
    } catch (e) {
      Alert.alert("Avatar error", (e as Error).message);
    }
  };

  const saveProfile = async () => {
    if (editName.trim().length < 2) {
      Alert.alert("Name too short", "Enter at least 2 characters.");
      return;
    }
    setSavingProfile(true);
    try {
      await api("/users/me", { method: "PATCH", json: { display_name: editName.trim(), bio: editBio.trim() } });
      await refresh();
      hapticSuccess();
      setEditOpen(false);
    } catch (e) {
      Alert.alert("Update failed", (e as Error).message);
    } finally {
      setSavingProfile(false);
    }
  };

  const unblock = async (uid: number) => {
    hapticLight();
    try {
      await api(`/users/${uid}/block`, { method: "DELETE" });
      await load();
    } catch (e) {
      Alert.alert("Error", (e as Error).message);
    }
  };

  const unsave = async (vidId: number) => {
    hapticLight();
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

  const tabs = [
    ...(user.role !== "viewer" ? [["studio", `Studio (${myVideos.length})`] as const] : []),
    ["saved", `Saved (${savedVideos.length})`] as const,
    ...(!user.is_guest ? [["blocked", `Blocked (${blocked.length})`] as const] : []),
  ];

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <LinearGradient colors={["#1C153D", "#121526", Theme.surface]} style={styles.heroCard}>
        <View style={styles.headerRow}>
          <Pressable onPress={changeAvatar} style={{ position: "relative" }}>
            <GradientAvatar name={user.display_name} url={user.avatar_url} size={68} ring />
            {!user.is_guest && (
              <View style={styles.camBadge}>
                <Ionicons name="camera" size={12} color="#fff" />
              </View>
            )}
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{user.display_name}</Text>
            <View style={styles.badgeRow}>
              <View style={styles.rolePill}>
                <Text style={styles.roleText}>{user.is_guest ? "GUEST" : user.role.toUpperCase()}</Text>
              </View>
              {!user.is_guest && !!user.email && <Text style={styles.meta}>{user.email}</Text>}
            </View>
            {!!user.bio && <Text style={styles.bio}>{user.bio}</Text>}
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

        <View style={styles.actionRow}>
          {!user.is_guest && (
            <Pressable
              style={styles.editBtn}
              onPress={() => {
                setEditName(user.display_name);
                setEditBio(user.bio ?? "");
                setEditOpen(true);
              }}
            >
              <Ionicons name="create-outline" size={15} color={Theme.text} />
              <Text style={styles.actionBtnText}>Edit profile</Text>
            </Pressable>
          )}
          <Pressable
            style={[styles.logoutBtn, { flex: 1 }]}
            onPress={async () => {
              await logout();
              router.replace("/login");
            }}
          >
            <Ionicons name="log-out-outline" size={16} color={Theme.text} />
            <Text style={styles.actionBtnText}>{user.is_guest ? "Sign in / Register" : "Log out"}</Text>
          </Pressable>
        </View>
      </LinearGradient>

      {/* Segmented tabs */}
      <View style={styles.segBar}>
        {tabs.map(([k, label]) => (
          <Pressable
            key={k}
            onPress={() => {
              hapticLight();
              setSection(k);
            }}
            style={[styles.segTab, section === k && styles.segTabActive]}
          >
            <Text style={[styles.segText, section === k && styles.segTextActive]}>{label}</Text>
          </Pressable>
        ))}
      </View>

      {section === "studio" && user.role !== "viewer" && (
        <View style={styles.card}>
          {myVideos.length === 0 ? (
            <EmptyView
              icon="videocam-outline"
              title="No uploads yet"
              subtitle="Create a 90-second video in the Create tab."
              actionLabel="Upload video"
              onAction={() => router.push("/(tabs)/upload")}
            />
          ) : (
            myVideos.map((v) => {
              const thumb = mediaSrc(v.thumbnail_url, v.status);
              const sc = statusColors(v.status);
              return (
                <Pressable key={v.id} style={styles.videoRow} onPress={() => v.status === "approved" && router.push(`/(tabs)?v=${v.id}`)}>
                  {thumb ? (
                    <Image source={{ uri: thumb }} style={styles.thumb} contentFit="cover" />
                  ) : (
                    <View style={[styles.thumb, { backgroundColor: "#000" }]} />
                  )}
                  <View style={{ flex: 1, gap: 4 }}>
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
                </Pressable>
              );
            })
          )}
        </View>
      )}

      {section === "saved" && (
        <View style={styles.card}>
          {savedVideos.length === 0 ? (
            <EmptyView
              icon="bookmark-outline"
              title="Nothing saved yet"
              subtitle="Tap the bookmark icon on any video in Watch to save it here."
            />
          ) : (
            savedVideos.map((v) => {
              const thumb = mediaSrc(v.thumbnail_url, v.status);
              return (
                <Pressable key={v.id} style={styles.videoRow} onPress={() => router.push(`/(tabs)?v=${v.id}`)}>
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
                </Pressable>
              );
            })
          )}
        </View>
      )}

      {section === "blocked" && (
        <View style={styles.card}>
          {blocked.length === 0 ? (
            <EmptyView icon="shield-checkmark-outline" title="No blocked users" subtitle="Accounts you block will appear here." />
          ) : (
            blocked.map((b) => (
              <View key={b.id} style={styles.row}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <GradientAvatar name={b.display_name} url={b.avatar_url} size={34} />
                  <Text style={styles.rowTitle}>{b.display_name}</Text>
                </View>
                <Pressable style={styles.smallBtn} onPress={() => unblock(b.id)}>
                  <Text style={styles.smallBtnText}>Unblock</Text>
                </Pressable>
              </View>
            ))
          )}
        </View>
      )}

      <Modal visible={editOpen} transparent animationType="fade" onRequestClose={() => setEditOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.dialog}>
            <Text style={styles.section}>Edit profile</Text>
            <TextInput
              style={styles.input}
              placeholder="Display name"
              placeholderTextColor={Theme.textMuted}
              value={editName}
              onChangeText={setEditName}
            />
            <TextInput
              style={[styles.input, { minHeight: 80, textAlignVertical: "top" }]}
              multiline
              maxLength={500}
              placeholder="Bio"
              placeholderTextColor={Theme.textMuted}
              value={editBio}
              onChangeText={setEditBio}
            />
            <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 10, alignItems: "center" }}>
              <Pressable onPress={() => setEditOpen(false)} style={{ padding: 10 }}>
                <Text style={{ color: Theme.textSecondary }}>Cancel</Text>
              </Pressable>
              <GradientButton label="Save" onPress={saveProfile} loading={savingProfile} />
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
  heroCard: { borderRadius: 22, padding: 16, borderWidth: 1, borderColor: Theme.borderStrong, gap: 14 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  camBadge: { position: "absolute", bottom: 0, right: 0, width: 24, height: 24, borderRadius: 12, backgroundColor: Theme.brand, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: Theme.bg },
  name: { color: Theme.text, fontSize: 20, fontWeight: "800" },
  badgeRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 3, flexWrap: "wrap" },
  rolePill: { backgroundColor: Theme.brandSoft, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  roleText: { color: Theme.accent, fontSize: 10, fontWeight: "800" },
  meta: { color: Theme.textMuted, fontSize: 12 },
  bio: { color: Theme.textSecondary, fontSize: 13, marginTop: 4 },
  statRow: { flexDirection: "row", gap: 8 },
  statBox: { flex: 1, backgroundColor: "rgba(9,10,16,0.55)", borderRadius: 12, paddingVertical: 10, alignItems: "center", borderWidth: 1, borderColor: Theme.border },
  statNum: { color: Theme.text, fontSize: 17, fontWeight: "800" },
  statLabel: { color: Theme.textMuted, fontSize: 11, marginTop: 2 },
  actionRow: { flexDirection: "row", gap: 8 },
  editBtn: { flexDirection: "row", gap: 6, backgroundColor: Theme.surfaceElevated, paddingHorizontal: 14, paddingVertical: 11, borderRadius: 12, alignItems: "center", borderWidth: 1, borderColor: Theme.borderStrong },
  logoutBtn: { flexDirection: "row", gap: 6, backgroundColor: Theme.surfaceElevated, paddingVertical: 11, borderRadius: 12, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: Theme.borderStrong },
  actionBtnText: { color: Theme.text, fontWeight: "700", fontSize: 13 },
  segBar: { flexDirection: "row", backgroundColor: Theme.surface, borderRadius: 14, padding: 4, borderWidth: 1, borderColor: Theme.border, gap: 4 },
  segTab: { flex: 1, paddingVertical: 9, alignItems: "center", borderRadius: 10 },
  segTabActive: { backgroundColor: Theme.brand },
  segText: { color: Theme.textMuted, fontSize: 12, fontWeight: "700" },
  segTextActive: { color: "#fff" },
  card: { backgroundColor: Theme.surface, borderRadius: 18, padding: 14, borderWidth: 1, borderColor: Theme.border, gap: 10 },
  section: { color: Theme.text, fontSize: 16, fontWeight: "700" },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 6 },
  videoRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Theme.border },
  thumb: { width: 48, height: 68, borderRadius: 10 },
  rowTitle: { color: Theme.text, fontWeight: "700", fontSize: 14 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  statusText: { fontSize: 11, fontWeight: "700", textTransform: "capitalize" },
  reject: { color: Theme.danger, fontSize: 12, marginTop: 2 },
  smallBtn: { backgroundColor: Theme.surfaceElevated, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: Theme.border },
  smallBtnText: { color: Theme.text, fontSize: 12, fontWeight: "700" },
  delBtn: { backgroundColor: Theme.dangerSoft, padding: 9, borderRadius: 10 },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "center", padding: 20 },
  dialog: { backgroundColor: Theme.surface, borderRadius: 20, padding: 18, gap: 12, borderWidth: 1, borderColor: Theme.border },
  input: { backgroundColor: Theme.bg, color: Theme.text, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: Theme.border, fontSize: 14 },
});
