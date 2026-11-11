import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { api, timeAgo, type Conversation, type User } from "@/lib/api";
import { Theme } from "@/lib/theme";

export default function MessagesScreen() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<User[]>([]);
  const [convos, setConvos] = useState<Conversation[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const loadConvos = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    try {
      setConvos(await api<Conversation[]>("/messages/conversations"));
    } catch {} finally {
      if (manual) setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadConvos();
      const id = setInterval(() => loadConvos(false), 4000);
      return () => clearInterval(id);
    }, [loadConvos]),
  );

  useEffect(() => {
    const t = setTimeout(async () => {
      if (query.trim().length < 2) {
        setResults([]);
        return;
      }
      try {
        setResults(await api<User[]>(`/users/search?q=${encodeURIComponent(query.trim())}`));
      } catch {}
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  return (
    <View style={styles.screen}>
      <View style={styles.searchBox}>
        <Ionicons name="search" size={18} color={Theme.textMuted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search people to message..."
          placeholderTextColor={Theme.textMuted}
          value={query}
          onChangeText={setQuery}
        />
        {query.length > 0 && (
          <Pressable onPress={() => { setQuery(""); setResults([]); }}>
            <Ionicons name="close-circle" size={18} color={Theme.textMuted} />
          </Pressable>
        )}
      </View>

      {results.length > 0 && (
        <View style={styles.searchResults}>
          {results.map((u) => (
            <Pressable
              key={u.id}
              style={styles.resultRow}
              onPress={() => {
                setQuery("");
                setResults([]);
                router.push(`/chat/${u.id}`);
              }}
            >
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{u.display_name.slice(0, 1).toUpperCase()}</Text>
              </View>
              <Text style={styles.name}>{u.display_name}</Text>
              <View style={styles.rolePill}>
                <Text style={styles.roleText}>{u.role}</Text>
              </View>
            </Pressable>
          ))}
        </View>
      )}

      <FlatList
        data={convos}
        keyExtractor={(c) => String(c.user.id)}
        refreshing={refreshing}
        onRefresh={() => loadConvos(true)}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Ionicons name="chatbubbles-outline" size={40} color={Theme.textMuted} />
            <Text style={styles.emptyTitle}>No conversations yet</Text>
            <Text style={styles.emptySub}>Search for a member above or message a creator from their profile.</Text>
          </View>
        }
        renderItem={({ item: c }) => (
          <Pressable style={styles.convoRow} onPress={() => router.push(`/chat/${c.user.id}`)}>
            <View style={[styles.avatar, c.unread_count > 0 && styles.avatarUnread]}>
              <Text style={styles.avatarText}>{c.user.display_name.slice(0, 1).toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <View style={styles.convoTop}>
                <Text style={styles.name}>{c.user.display_name}</Text>
                <Text style={styles.time}>{timeAgo(c.last_at)}</Text>
              </View>
              <Text style={[styles.preview, c.unread_count > 0 && styles.previewUnread]} numberOfLines={1}>
                {c.last_message}
              </Text>
            </View>
            {c.unread_count > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{c.unread_count}</Text>
              </View>
            )}
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Theme.bg },
  searchBox: { flexDirection: "row", alignItems: "center", gap: 8, margin: 12, paddingHorizontal: 14, backgroundColor: Theme.surface, borderRadius: 14, borderWidth: 1, borderColor: Theme.border },
  searchInput: { flex: 1, color: Theme.text, paddingVertical: 11, fontSize: 14 },
  searchResults: { marginHorizontal: 12, marginBottom: 8, backgroundColor: Theme.surfaceElevated, borderRadius: 14, borderWidth: 1, borderColor: Theme.borderStrong, overflow: "hidden" },
  resultRow: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderBottomWidth: 1, borderBottomColor: Theme.border },
  convoRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: Theme.border },
  avatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: Theme.brand, alignItems: "center", justifyContent: "center" },
  avatarUnread: { borderWidth: 2, borderColor: Theme.accent },
  avatarText: { color: "#fff", fontWeight: "800", fontSize: 16 },
  convoTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  name: { color: Theme.text, fontWeight: "700", fontSize: 15 },
  time: { color: Theme.textMuted, fontSize: 11 },
  rolePill: { marginLeft: "auto", backgroundColor: Theme.surface, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, borderWidth: 1, borderColor: Theme.border },
  roleText: { color: Theme.textMuted, fontSize: 11, textTransform: "capitalize", fontWeight: "600" },
  preview: { color: Theme.textMuted, fontSize: 13, marginTop: 3 },
  previewUnread: { color: Theme.text, fontWeight: "600" },
  badge: { minWidth: 22, height: 22, borderRadius: 11, backgroundColor: Theme.brand, alignItems: "center", justifyContent: "center", paddingHorizontal: 6 },
  badgeText: { color: "#fff", fontSize: 11, fontWeight: "800" },
  emptyWrap: { alignItems: "center", paddingTop: 64, paddingHorizontal: 32, gap: 8 },
  emptyTitle: { color: Theme.text, fontSize: 16, fontWeight: "700" },
  emptySub: { color: Theme.textMuted, fontSize: 13, textAlign: "center" },
});
