import { Image } from "expo-image";
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { api, formatTime, mediaSrc, type ModItem, type Page, type Report, type User } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export default function AdminScreen() {
  const { user: me } = useAuth();
  const [tab, setTab] = useState<"queue" | "reports" | "users">("queue");
  const [items, setItems] = useState<ModItem[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [users, setUsers] = useState<User[]>([]);

  const load = useCallback(async () => {
    if (me?.role !== "admin") return;
    try {
      const [q, r, u] = await Promise.all([
        api<Page<ModItem>>("/admin/moderation/queue?status=all&page_size=30"),
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
    }, [load]),
  );

  const moderate = async (it: ModItem, action: "approve" | "restore" | "hide" | "reject" | "remove") => {
    try {
      if (action === "remove") {
        await api(`/admin/moderation/${it.type}/${it.id}/remove`, { method: "POST", json: { reason: "Removed by admin" } });
      } else if (action === "reject") {
        await api(`/admin/moderation/${it.type}/${it.id}/reject`, { method: "POST", json: { reason: "Does not meet guidelines" } });
      } else {
        await api(`/admin/moderation/${it.type}/${it.id}/${action}`, { method: "POST", json: {} });
      }
      await load();
    } catch (e) {
      Alert.alert("Error", (e as Error).message);
    }
  };

  const removeReported = async (r: Report) => {
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
      await load();
    } catch (e) {
      Alert.alert("Error", (e as Error).message);
    }
  };

  const dismissReport = async (id: number) => {
    try {
      await api(`/admin/reports/${id}/resolve`, { method: "POST", json: { resolution: "dismissed" } });
      await load();
    } catch (e) {
      Alert.alert("Error", (e as Error).message);
    }
  };

  const toggleSuspend = async (u: User) => {
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
        <Text style={{ color: "#fff" }}>Admin access required.</Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.tabs}>
        {([["queue", `Content (${items.length})`], ["reports", `Reports (${reports.length})`], ["users", `Users (${users.length})`]] as const).map(([k, label]) => (
          <Pressable key={k} onPress={() => setTab(k)} style={[styles.tab, tab === k && styles.tabActive]}>
            <Text style={[styles.tabText, tab === k && styles.tabTextActive]}>{label}</Text>
          </Pressable>
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.container}>
        {tab === "queue" &&
          items.map((it) => {
            const thumb = mediaSrc(it.thumbnail_url, it.status);
            return (
              <View key={`${it.type}-${it.id}`} style={styles.card}>
                <View style={styles.row}>
                  {thumb && <Image source={{ uri: thumb }} style={styles.thumb} contentFit="cover" />}
                  <View style={{ flex: 1 }}>
                    <Text style={styles.title}>{it.title}</Text>
                    <Text style={styles.meta}>
                      {it.type.toUpperCase()} · {it.status} · {it.owner.display_name}
                      {it.duration_seconds != null ? ` · ${formatTime(it.duration_seconds)}` : ""}
                    </Text>
                  </View>
                </View>
                <View style={styles.btnRow}>
                  {it.status === "pending" && (
                    <>
                      <Pressable style={styles.primaryBtn} onPress={() => moderate(it, "approve")}>
                        <Text style={styles.btnText}>Approve</Text>
                      </Pressable>
                      <Pressable style={styles.warnBtn} onPress={() => moderate(it, "reject")}>
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
          })}

        {tab === "reports" &&
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
          ))}

        {tab === "users" &&
          users.map((u) => (
            <View key={u.id} style={styles.card}>
              <Text style={styles.title}>{u.display_name}</Text>
              <Text style={styles.meta}>
                {u.role} · {u.is_active ? "Active" : "Suspended"} · {u.email}
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
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#0d0c12" },
  center: { flex: 1, backgroundColor: "#0d0c12", alignItems: "center", justifyContent: "center" },
  tabs: { flexDirection: "row", padding: 10, gap: 8, backgroundColor: "#14131c", borderBottomWidth: 1, borderBottomColor: "#282638" },
  tab: { flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: "center", backgroundColor: "#1d1b2b" },
  tabActive: { backgroundColor: "#7c5cff" },
  tabText: { color: "#9c9aa8", fontSize: 12, fontWeight: "700" },
  tabTextActive: { color: "#fff" },
  container: { padding: 12, gap: 10 },
  card: { backgroundColor: "#171622", borderRadius: 14, padding: 12, borderWidth: 1, borderColor: "#282638", gap: 8 },
  row: { flexDirection: "row", gap: 10, alignItems: "center" },
  thumb: { width: 42, height: 60, borderRadius: 8, backgroundColor: "#000" },
  title: { color: "#fff", fontWeight: "700", fontSize: 14 },
  meta: { color: "#9c9aa8", fontSize: 12 },
  reason: { color: "#e0dfe8", fontSize: 13 },
  btnRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  primaryBtn: { backgroundColor: "#7c5cff", paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8 },
  warnBtn: { backgroundColor: "#8a4b16", paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8 },
  secBtn: { backgroundColor: "#252336", paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8 },
  dangerBtn: { backgroundColor: "#3a1b24", paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8 },
  btnText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  dangerText: { color: "#ff6b81", fontSize: 12, fontWeight: "700" },
});
