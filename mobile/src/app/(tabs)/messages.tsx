import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { api, type Conversation, type User } from "@/lib/api";

export default function MessagesScreen() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<User[]>([]);
  const [convos, setConvos] = useState<Conversation[]>([]);

  const loadConvos = useCallback(async () => {
    try {
      setConvos(await api<Conversation[]>("/messages/conversations"));
    } catch {}
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadConvos();
      const id = setInterval(loadConvos, 4000);
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
        <Ionicons name="search" size={18} color="#8f8da0" />
        <TextInput
          style={styles.searchInput}
          placeholder="Find someone to message..."
          placeholderTextColor="#7c7b8a"
          value={query}
          onChangeText={setQuery}
        />
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
              <Text style={styles.role}>{u.role}</Text>
            </Pressable>
          ))}
        </View>
      )}

      <FlatList
        data={convos}
        keyExtractor={(c) => String(c.user.id)}
        ListEmptyComponent={<Text style={styles.empty}>No conversations yet. Search for someone above.</Text>}
        renderItem={({ item: c }) => (
          <Pressable style={styles.convoRow} onPress={() => router.push(`/chat/${c.user.id}`)}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{c.user.display_name.slice(0, 1).toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{c.user.display_name}</Text>
              <Text style={styles.preview} numberOfLines={1}>
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
  screen: { flex: 1, backgroundColor: "#0d0c12" },
  searchBox: { flexDirection: "row", alignItems: "center", gap: 8, margin: 12, paddingHorizontal: 12, backgroundColor: "#171622", borderRadius: 12, borderWidth: 1, borderColor: "#282638" },
  searchInput: { flex: 1, color: "#fff", paddingVertical: 10, fontSize: 14 },
  searchResults: { marginHorizontal: 12, marginBottom: 8, backgroundColor: "#1c1a29", borderRadius: 12, borderWidth: 1, borderColor: "#33304a", overflow: "hidden" },
  resultRow: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderBottomWidth: 1, borderBottomColor: "#282638" },
  convoRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#1e1c2b" },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: "#7c5cff", alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#fff", fontWeight: "800", fontSize: 16 },
  name: { color: "#fff", fontWeight: "700", fontSize: 15 },
  role: { color: "#9c9aa8", fontSize: 12, marginLeft: "auto", textTransform: "capitalize" },
  preview: { color: "#9c9aa8", fontSize: 13, marginTop: 2 },
  badge: { minWidth: 22, height: 22, borderRadius: 11, backgroundColor: "#7c5cff", alignItems: "center", justifyContent: "center", paddingHorizontal: 6 },
  badgeText: { color: "#fff", fontSize: 11, fontWeight: "800" },
  empty: { color: "#8f8da0", textAlign: "center", marginTop: 40, paddingHorizontal: 24 },
});
