import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export default function TabsLayout() {
  const { user } = useAuth();
  const [unreadMsgs, setUnreadMsgs] = useState(0);

  useEffect(() => {
    if (!user) return;
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
        headerStyle: { backgroundColor: "#14131c" },
        headerTintColor: "#fff",
        tabBarStyle: { backgroundColor: "#14131c", borderTopColor: "#282638" },
        tabBarActiveTintColor: "#7c5cff",
        tabBarInactiveTintColor: "#8f8da0",
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Watch",
          headerShown: false,
          tabBarIcon: ({ color, size }) => <Ionicons name="play-circle" size={size} color={color as string} />,
        }}
      />
      <Tabs.Screen
        name="upload"
        options={{
          title: "Upload",
          href: user && user.role !== "viewer" ? "/(tabs)/upload" : null,
          tabBarIcon: ({ color, size }) => <Ionicons name="add-circle" size={size} color={color as string} />,
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: "Messages",
          tabBarBadge: unreadMsgs > 0 ? unreadMsgs : undefined,
          tabBarIcon: ({ color, size }) => <Ionicons name="chatbubbles" size={size} color={color as string} />,
        }}
      />
      <Tabs.Screen
        name="admin"
        options={{
          title: "Admin",
          href: user?.role === "admin" ? "/(tabs)/admin" : null,
          tabBarIcon: ({ color, size }) => <Ionicons name="shield-checkmark" size={size} color={color as string} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color, size }) => <Ionicons name="person" size={size} color={color as string} />,
        }}
      />
    </Tabs>
  );
}
