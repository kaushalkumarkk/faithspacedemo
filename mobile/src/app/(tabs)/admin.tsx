import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useFocusEffect } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";
import { useCallback, useState } from "react";
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { EmptyView, hapticLight, hapticSuccess } from "@/components/ui";
import { api, formatTime, mediaSrc, type ModItem, type Page, type Report, type User } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { statusColors, Theme } from "@/lib/theme";

const STATUS_FILTERS = ["all", "pending", "approved", "hidden", "rejected"] as const;

function PreviewModal({ item, onClose }: { item: ModItem | null; onClose: () => void }) {
  const src = item ? mediaSrc(item.media_url, item.status === "approved" ? "pending" : item.status) ?? null : null;
  const player = useVideoPlayer(src, (p) => {
    if (src) p.play();
  });

  return (
    <Modal visible={!!item} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.previewCard}>
          <View style={styles.previewHeader}>
            <Text style={styles.title} numberOfLines={1}>{item?.title}</Text>
            <Pressable onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={20} color={Theme.text} />
            </Pressable>
          </View>
          <View style={styles.previewPlayerWrap}>
            <VideoView player={player} style={{ width: "100%", height: "100%" }} contentFit="contain" nativeControls />
          </View>
        </View>
      </View>
    </Modal>
  );
}

export default function AdminScreen() {
  const { user: me } = useAuth();
  const [tab, setTab] = useState<"queue" | "reports" | "users">("queue");
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_FILTERS)[number]>("all");
  const [items, setItems] = useState<ModItem[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [previewItem, setPreviewItem] = useState<ModItem | null>(null);
  const [rejecting, setRejecting] = useState<ModItem | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const load = useCallback(async () => {
    if (me?.role !== "admin") return;
    try {
      const [q, r, u] = await Promise.all([
        api<Page<ModItem>>("/admin/moderation/queue?status=all&page_size=40"),
        api<Page<Report>>("/admin/reports?status=open&page_size=30"),
        api<Page<User>>("/users?page_size=30"),
      ]);
      setItems(q.items);
      setReports(r.items);
      setUsers(u.items);
    } catch {}
  }, [me?.role]);

  useFocusEffect(
    useCallback(() => {
      load();
      // Keep online/offline status fresh while the tab is open (only the cheap user list).
      const id = setInterval(async () => {
        if (me?.role !== "admin") return;
        try {
          const u = await api<Page<User>>("/users?page_size=30");
          setUsers((prev) => (JSON.stringify(prev) === JSON.stringify(u.items) ? prev : u.items));
        } catch {}
      }, 8000);
      return () => clearInterval(id);
    }, [load, me?.role]),
  );

  const moderate = async (it: ModItem, action: "approve" | "restore" | "hide" | "remove") => {
    hapticLight();
    try {
      if (action === "remove") {
        await api(`/admin/moderation/${it.type}/${it.id}/remove`, { method: "POST", json: { reason: "Removed by admin" } });
      } else {
        await api(`/admin/moderation/${it.type}/${it.id}/${action}`, { method: "POST", json: {} });
      }
      hapticSuccess();
      await load();
    } catch (e) {
      Alert.alert("Error", (e as Error).message);
    }
  };

  const confirmReject = async () => {
    if (!rejecting || rejectReason.trim().length < 3) return;
    try {
      await api(`/admin/moderation/${rejecting.type}/${rejecting.id}/reject`, {
        method: "POST",
        json: { reason: rejectReason.trim() },
      });
      hapticSuccess();
      setRejecting(null);
      setRejectReason("");
      await load();
    } catch (e) {
      Alert.alert("Error", (e as Error).message);
    }
  };

  const removeReported = async (r: Report) => {
    hapticLight();
    try {
      if (r.target_type === "comment") {
        await api(`/comments/${r.target_id}`, { method: "DELETE" });
        await api(`/admin/reports/${r.id}/resolve`, { method: "POST", json: { resolution: "resolved" } });
      } else if (r.target_type === "video" || r.target_type === "episode") {
        await api(`/admin/moderation/${r.target_type}/${r.target_id}/remove`, { method: "POST", json: { reason: `Reported: ${r.reason}` } });
      } else if (r.target_type === "user") {
        await api(`/users/${r.target_id}`, { method: "DELETE" });
        await api(`/admin/reports/${r.id}/resolve`, { method: "POST", json: { resolution: "resolved" } });
      } else if (r.target_type === "message") {
        if (r.target_user_id) await api(`/users/${r.target_user_id}/status`, { method: "PATCH", json: { is_active: false } });
        await api(`/admin/reports/${r.id}/resolve`, { method: "POST", json: { resolution: "resolved" } });
      }
      hapticSuccess();
      await load();
    } catch (e) {
      Alert.alert("Error", (e as Error).message);
    }
  };

  const dismissReport = async (id: number) => {
    hapticLight();
    try {
      await api(`/admin/reports/${id}/resolve`, { method: "POST", json: { resolution: "dismissed" } });
      await load();
    } catch (e) {
      Alert.alert("Error", (e as Error).message);
    }
  };

  const toggleSuspend = async (u: User) => {
    hapticLight();
    try {
      await api(`/users/${u.id}/status`, { method: "PATCH", json: { is_active: !u.is_active } });
      await load();
    } catch (e) {
      Alert.alert("Error", (e as Error).message);
    }
  };

  const removeUser = (u: User) => {
    Alert.alert("Remove user permanently", `Delete ${u.display_name} and all their content?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          try {
            await api(`/users/${u.id}`, { method: "DELETE" });
            hapticSuccess();
            await load();
          } catch (e) {
            Alert.alert("Error", (e as Error).message);
          }
        },
      },
    ]);
  };

  if (me?.role !== "admin") {
    return (
      <View style={styles.center}>
        <Text style={{ color: Theme.text }}>Admin access required.</Text>
      </View>
    );
  }

  const pendingCount = items.filter((i) => i.status === "pending").length;
  const filteredItems = statusFilter === "all" ? items : items.filter((i) => i.status === statusFilter);

  return (
    <View style={styles.screen}>
      <View style={styles.statsBar}>
        <View style={styles.statChip}>
          <Text style={[styles.statVal, { color: Theme.warn }]}>{pendingCount}</Text>
          <Text style={styles.statLbl}>Pending</Text>
        </View>
        <View style={styles.statChip}>
          <Text style={[styles.statVal, { color: Theme.danger }]}>{reports.length}</Text>
          <Text style={styles.statLbl}>Reports</Text>
        </View>
        <View style={styles.statChip}>
          <Text style={[styles.statVal, { color: Theme.success }]}>{items.filter((i) => i.status === "approved").length}</Text>
          <Text style={styles.statLbl}>Live</Text>
        </View>
        <View style={styles.statChip}>
          <Text style={styles.statVal}>{users.length}</Text>
          <Text style={styles.statLbl}>Users</Text>
        </View>
      </View>

      <View style={styles.tabs}>
        {([["queue", `Content (${items.length})`], ["reports", `Reports (${reports.length})`], ["users", `Users (${users.length})`]] as const).map(([k, label]) => (
          <Pressable key={k} onPress={() => { hapticLight(); setTab(k); }} style={[styles.tab, tab === k && styles.tabActive]}>
            <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={[styles.tabText, tab === k && styles.tabTextActive]}>{label}</Text>
          </Pressable>
        ))}
      </View>

      {tab === "queue" && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow} style={styles.filterScroll}>
          {STATUS_FILTERS.map((s) => (
            <Pressable key={s} onPress={() => { hapticLight(); setStatusFilter(s); }} style={[styles.filterPill, statusFilter === s && styles.filterPillActive]}>
              <Text numberOfLines={1} style={[styles.filterText, statusFilter === s && { color: "#fff" }]}>{s}</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      <ScrollView contentContainerStyle={styles.container}>
        {tab === "queue" &&
          (filteredItems.length === 0 ? (
            <EmptyView icon="checkmark-done-circle-outline" title="Queue is clear" subtitle="No items match this status filter." />
          ) : (
            filteredItems.map((it) => {
              const thumb = mediaSrc(it.thumbnail_url, it.status);
              const sc = statusColors(it.status);
              return (
                <View key={`${it.type}-${it.id}`} style={styles.card}>
                  <View style={styles.row}>
                    {thumb ? (
                      <Pressable onPress={() => setPreviewItem(it)}>
                        <Image source={{ uri: thumb }} style={styles.thumb} contentFit="cover" />
                      </Pressable>
                    ) : (
                      <View style={[styles.thumb, { alignItems: "center", justifyContent: "center" }]}>
                        <Ionicons name="play" size={18} color="#fff" />
                      </View>
                    )}
                    <View style={{ flex: 1, gap: 4 }}>
                      <Text style={styles.title}>{it.title}</Text>
                      <View style={styles.badgeLine}>
                        <View style={[styles.statusBadge, { backgroundColor: sc.bg }]}>
                          <Text style={[styles.statusText, { color: sc.fg }]}>{it.status}</Text>
                        </View>
                        <Text style={styles.meta}>
                          {it.type.toUpperCase()} · {it.owner.display_name}
                          {it.duration_seconds != null ? ` · ${formatTime(it.duration_seconds)}` : ""}
                        </Text>
                      </View>
                    </View>
                  </View>
                  <View style={styles.btnRow}>
                    <Pressable style={styles.secBtn} onPress={() => setPreviewItem(it)}>
                      <Text style={styles.btnText}>Preview</Text>
                    </Pressable>
                    {it.status === "pending" && (
                      <>
                        <Pressable style={styles.primaryBtn} onPress={() => moderate(it, "approve")}>
                          <Text style={styles.btnText}>Approve</Text>
                        </Pressable>
                        <Pressable style={styles.warnBtn} onPress={() => { setRejectReason(""); setRejecting(it); }}>
                          <Text style={styles.btnText}>Reject</Text>
                        </Pressable>
                      </>
                    )}
                    {(it.status === "hidden" || it.status === "rejected") && (
                      <Pressable style={styles.primaryBtn} onPress={() => moderate(it, "restore")}>
                        <Text style={styles.btnText}>Restore</Text>
                      </Pressable>
                    )}
                    {it.status === "approved" && (
                      <Pressable style={styles.secBtn} onPress={() => moderate(it, "hide")}>
                        <Text style={styles.btnText}>Hide</Text>
                      </Pressable>
                    )}
                    <Pressable style={styles.dangerBtn} onPress={() => moderate(it, "remove")}>
                      <Text style={styles.dangerText}>Remove</Text>
                    </Pressable>
                  </View>
                </View>
              );
            })
          ))}

        {tab === "reports" &&
          (reports.length === 0 ? (
            <EmptyView icon="shield-outline" title="No open reports" subtitle="Flagged videos, comments, messages, and users appear here." />
          ) : (
            reports.map((r) => (
              <View key={r.id} style={styles.card}>
                <Text style={styles.meta}>
                  {r.target_type.toUpperCase()} · reported by {r.reporter.display_name}
                </Text>
                <Text style={styles.title}>{r.target_title}</Text>
                <Text style={styles.reason}>“{r.reason}”</Text>
                <View style={styles.btnRow}>
                  <Pressable style={styles.dangerBtn} onPress={() => removeReported(r)}>
                    <Text style={styles.dangerText}>
                      {r.target_type === "message" ? "Suspend sender" : "Remove permanently"}
                    </Text>
                  </Pressable>
                  <Pressable style={styles.secBtn} onPress={() => dismissReport(r.id)}>
                    <Text style={styles.btnText}>Dismiss</Text>
                  </Pressable>
                </View>
              </View>
            ))
          ))}

        {tab === "users" &&
          users.map((u) => (
            <View key={u.id} style={styles.card}>
              <Text style={styles.title}>{u.display_name}</Text>
              <Text style={styles.meta}>
                {u.is_online ? "🟢 Online" : "⚫ Offline"} · {u.role} · {u.is_active ? "Active" : "Suspended"} · {u.email}
              </Text>
              {u.id !== me.id && (
                <View style={styles.btnRow}>
                  <Pressable style={styles.secBtn} onPress={() => toggleSuspend(u)}>
                    <Text style={styles.btnText}>{u.is_active ? "Suspend" : "Reinstate"}</Text>
                  </Pressable>
                  {u.role !== "admin" && (
                    <Pressable style={styles.dangerBtn} onPress={() => removeUser(u)}>
                      <Text style={styles.dangerText}>Remove user</Text>
                    </Pressable>
                  )}
                </View>
              )}
            </View>
          ))}
      </ScrollView>

      <PreviewModal item={previewItem} onClose={() => setPreviewItem(null)} />

      <Modal visible={!!rejecting} transparent animationType="fade" onRequestClose={() => setRejecting(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.dialog}>
            <Text style={styles.title}>Reject “{rejecting?.title}”</Text>
            <TextInput
              style={styles.input}
              multiline
              placeholder="Reason shown to the creator..."
              placeholderTextColor={Theme.textMuted}
              value={rejectReason}
              onChangeText={setRejectReason}
            />
            <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 10 }}>
              <Pressable onPress={() => setRejecting(null)} style={{ padding: 10 }}><Text style={{ color: Theme.textSecondary }}>Cancel</Text></Pressable>
              <Pressable
                style={[styles.warnBtn, rejectReason.trim().length < 3 && { opacity: 0.5 }]}
                disabled={rejectReason.trim().length < 3}
                onPress={confirmReject}
              >
                <Text style={styles.btnText}>Reject</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Theme.bg },
  center: { flex: 1, backgroundColor: Theme.bg, alignItems: "center", justifyContent: "center" },
  statsBar: { flexDirection: "row", gap: 8, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 6 },
  statChip: { flex: 1, backgroundColor: Theme.surface, borderRadius: 12, paddingVertical: 8, alignItems: "center", borderWidth: 1, borderColor: Theme.border },
  statVal: { color: Theme.text, fontSize: 16, fontWeight: "800" },
  statLbl: { color: Theme.textMuted, fontSize: 10, marginTop: 1 },
  tabs: { flexDirection: "row", padding: 10, gap: 8, backgroundColor: Theme.surface, borderBottomWidth: 1, borderBottomColor: Theme.border },
  tab: { flex: 1, minWidth: 0, paddingHorizontal: 4, paddingVertical: 8, borderRadius: 10, alignItems: "center", backgroundColor: Theme.bg, borderWidth: 1, borderColor: Theme.border },
  tabActive: { backgroundColor: Theme.brand, borderColor: Theme.brand },
  tabText: { color: Theme.textMuted, fontSize: 12, fontWeight: "700" },
  tabTextActive: { color: "#fff" },
  // Explicit height: a horizontal ScrollView in a column otherwise collapses and cuts the pills in half.
  filterScroll: { flexGrow: 0, flexShrink: 0, height: 52 },
  filterRow: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12 },
  filterPill: { flexShrink: 0, height: 36, justifyContent: "center", paddingHorizontal: 16, borderRadius: 18, backgroundColor: Theme.surface, borderWidth: 1, borderColor: Theme.border },
  filterPillActive: { backgroundColor: Theme.brandSoft, borderColor: Theme.brand },
  filterText: { color: Theme.textMuted, fontSize: 12, fontWeight: "600", textTransform: "capitalize" },
  container: { padding: 12, gap: 10 },
  card: { backgroundColor: Theme.surface, borderRadius: 16, padding: 13, borderWidth: 1, borderColor: Theme.border, gap: 10 },
  row: { flexDirection: "row", gap: 10, alignItems: "center" },
  thumb: { width: 44, height: 64, borderRadius: 10, backgroundColor: "#000" },
  title: { color: Theme.text, fontWeight: "700", fontSize: 14 },
  badgeLine: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  statusBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  statusText: { fontSize: 10, fontWeight: "700", textTransform: "capitalize" },
  meta: { color: Theme.textMuted, fontSize: 12 },
  reason: { color: Theme.textSecondary, fontSize: 13 },
  btnRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  primaryBtn: { backgroundColor: Theme.brand, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 9 },
  warnBtn: { backgroundColor: "#9a5012", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 9 },
  secBtn: { backgroundColor: Theme.surfaceElevated, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 9, borderWidth: 1, borderColor: Theme.border },
  dangerBtn: { backgroundColor: Theme.dangerSoft, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 9 },
  btnText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  dangerText: { color: Theme.danger, fontSize: 12, fontWeight: "700" },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.75)", justifyContent: "center", padding: 20 },
  dialog: { backgroundColor: Theme.surface, borderRadius: 20, padding: 18, gap: 12, borderWidth: 1, borderColor: Theme.border },
  previewCard: { backgroundColor: Theme.surface, borderRadius: 20, padding: 14, gap: 12, borderWidth: 1, borderColor: Theme.border },
  previewHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 },
  closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: Theme.surfaceElevated, alignItems: "center", justifyContent: "center" },
  previewPlayerWrap: { height: 360, borderRadius: 14, overflow: "hidden", backgroundColor: "#000" },
  input: { backgroundColor: Theme.bg, color: Theme.text, borderRadius: 12, padding: 12, minHeight: 80, textAlignVertical: "top", borderWidth: 1, borderColor: Theme.border },
});
