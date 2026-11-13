import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { useEffect, useState } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { onBadgesChanged } from "@/lib/badges";
import { Theme } from "@/lib/theme";

export default function TabsLayout() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [unreadMsgs, setUnreadMsgs] = useState(0);
  const [unreadAlerts, setUnreadAlerts] = useState(0);

  useEffect(() => {
    if (!user) {
      setUnreadMsgs(0);
      setUnreadAlerts(0);
      return;
    }
    let alive = true;
    const poll = async () => {
      try {
        const alerts = await api<{ count: number }>("/notifications/unread-count");
        if (alive) setUnreadAlerts(alerts.count);
      } catch {}
      if (user.is_guest) return; // guests have no messages
      try {
        const res = await api<{ count: number }>("/messages/unread-count");
        if (alive) setUnreadMsgs(res.count);
      } catch {}
    };
    poll();
    const id = setInterval(poll, 5000);
    const off = onBadgesChanged((patch) => {
      if (patch?.alerts !== undefined) setUnreadAlerts(patch.alerts);
      if (patch?.messages !== undefined) setUnreadMsgs(patch.messages);
      poll();
    });
    return () => {
      alive = false;
      clearInterval(id);
      off();
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
          // Grow with the system gesture bar / home indicator so the labels are never cut off.
          height: 56 + insets.bottom,
          paddingBottom: Math.max(insets.bottom, 6),
          paddingTop: 6,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
        tabBarAllowFontScaling: false,
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
        name="notifications"
        options={{
          title: "Alerts",
          tabBarBadge: unreadAlerts > 0 ? (unreadAlerts > 9 ? "9+" : unreadAlerts) : undefined,
          tabBarBadgeStyle: { backgroundColor: Theme.danger, color: "#fff", fontSize: 10 },
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? "notifications" : "notifications-outline"} size={size} color={color as string} />
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
