import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { EmptyView, hapticLight } from "@/components/ui";
import { api, timeAgo, type AppNotification, type Page } from "@/lib/api";
import { Theme } from "@/lib/theme";

const ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  approved: "checkmark-circle",
  rejected: "close-circle",
  hidden: "eye-off",
  restored: "refresh-circle",
  comment: "chatbubble-ellipses",
  reply: "return-down-forward",
  follow: "person-add",
  report: "flag",
};

export default function NotificationsScreen() {
  const router = useRouter();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    try {
      const res = await api<Page<AppNotification>>("/notifications?page_size=50");
      setItems((prev) => (JSON.stringify(prev) === JSON.stringify(res.items) ? prev : res.items));
    } catch {} finally {
      setLoaded(true);
      if (manual) setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
      const id = setInterval(() => load(), 8000);
      return () => clearInterval(id);
    }, [load]),
  );

  const unread = items.filter((n) => !n.is_read).length;

  const markAll = async () => {
    hapticLight();
    setItems((prev) => prev.map((n) => ({ ...n, is_read: true })));
    try {
      await api("/notifications/read-all", { method: "POST" });
    } catch {
      load();
    }
  };

  const open = async (n: AppNotification) => {
    hapticLight();
    if (!n.is_read) {
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, is_read: true } : x)));
      api(`/notifications/${n.id}/read`, { method: "POST" }).catch(() => load());
    }
    // Links are web paths; map the ones the app has a screen for.
    const profile = n.link?.match(/^\/profile\/(\d+)/);
    if (profile) router.push(`/user/${profile[1]}`);
    else if (n.link?.startsWith("/?v=")) router.push("/(tabs)");
  };

  return (
    <View style={styles.screen}>
      {unread > 0 && (
        <View style={styles.bar}>
          <Text style={styles.barText}>{unread} unread</Text>
          <Pressable onPress={markAll} hitSlop={8}>
            <Text style={styles.markAll}>Mark all read</Text>
          </Pressable>
        </View>
      )}
      <FlatList
        data={items}
        keyExtractor={(n) => String(n.id)}
        refreshing={refreshing}
        onRefresh={() => load(true)}
        contentContainerStyle={items.length ? styles.list : { flexGrow: 1 }}
        ListEmptyComponent={
          loaded ? (
            <EmptyView icon="notifications-outline" title="No notifications yet" subtitle="Approvals, comments, replies and new followers show up here." />
          ) : undefined
        }
        renderItem={({ item: n }) => (
          <Pressable onPress={() => open(n)} style={[styles.row, !n.is_read && styles.rowUnread]}>
            <View style={[styles.iconCircle, !n.is_read && { backgroundColor: Theme.brandSoft }]}>
              <Ionicons name={ICONS[n.type] ?? "notifications"} size={20} color={n.is_read ? Theme.textMuted : Theme.brand} />
            </View>
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={[styles.msg, n.is_read && { color: Theme.textSecondary }]}>{n.message}</Text>
              <Text style={styles.time}>{timeAgo(n.created_at)}</Text>
            </View>
            {!n.is_read && <View style={styles.dot} accessibilityLabel="unread" />}
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Theme.bg },
  bar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Theme.border },
  barText: { color: Theme.textMuted, fontSize: 13, fontWeight: "600" },
  markAll: { color: Theme.brand, fontSize: 13, fontWeight: "700" },
  list: { padding: 12, gap: 8 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: Theme.surface, borderRadius: 14, padding: 12, borderWidth: 1, borderColor: Theme.border },
  rowUnread: { borderColor: Theme.brand },
  iconCircle: { width: 38, height: 38, borderRadius: 19, backgroundColor: Theme.surfaceElevated, alignItems: "center", justifyContent: "center" },
  msg: { color: Theme.text, fontSize: 14, fontWeight: "600", lineHeight: 19 },
  time: { color: Theme.textMuted, fontSize: 12 },
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: Theme.brand },
});
