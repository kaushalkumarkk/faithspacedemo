import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Theme } from "@/lib/theme";

export default function TabsLayout() {
  const { user } = useAuth();
  const [unreadMsgs, setUnreadMsgs] = useState(0);

  useEffect(() => {
    if (!user || user.is_guest) {
      setUnreadMsgs(0);
      return;
    }
    let alive = true;
    const poll = async () => {
      try {
        const res = await api<{ count: number }>("/messages/unread-count");
        if (alive) setUnreadMsgs(res.count);
      } catch {}
    };
    poll();
    const id = setInterval(poll, 5000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [user]);

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: Theme.surface },
        headerTintColor: Theme.text,
        headerShadowVisible: false,
        tabBarStyle: {
          backgroundColor: Theme.surface,
          borderTopColor: Theme.border,
          height: 60,
          paddingBottom: 6,
          paddingTop: 4,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
        tabBarActiveTintColor: Theme.brand,
        tabBarInactiveTintColor: Theme.textMuted,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Watch",
          headerShown: false,
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? "play-circle" : "play-circle-outline"} size={size} color={color as string} />
          ),
        }}
      />
      <Tabs.Screen
        name="upload"
        options={{
          title: "Create",
          href: user && user.role !== "viewer" ? "/(tabs)/upload" : null,
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? "add-circle" : "add-circle-outline"} size={size} color={color as string} />
          ),
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: "Messages",
          href: user && !user.is_guest ? "/(tabs)/messages" : null,
          tabBarBadge: unreadMsgs > 0 ? unreadMsgs : undefined,
          tabBarBadgeStyle: { backgroundColor: Theme.danger, color: "#fff", fontSize: 10 },
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? "chatbubbles" : "chatbubbles-outline"} size={size} color={color as string} />
          ),
        }}
      />
      <Tabs.Screen
        name="admin"
        options={{
          title: "Admin",
          href: user?.role === "admin" ? "/(tabs)/admin" : null,
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? "shield-checkmark" : "shield-checkmark-outline"} size={size} color={color as string} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? "person" : "person-outline"} size={size} color={color as string} />
          ),
        }}
      />
    </Tabs>
  );
}
