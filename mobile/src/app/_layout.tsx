import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "@/lib/auth";

SplashScreen.preventAutoHideAsync();

function RootNavigator() {
  const { user, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [loading]);

  useEffect(() => {
    if (loading) return;
    const inLogin = segments[0] === "login";
    if (!user && !inLogin) {
      router.replace("/login");
    } else if (user && inLogin) {
      router.replace("/(tabs)");
    }
  }, [loading, user, segments, router]);

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: "#0d0c12", alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator size="large" color="#7c5cff" />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerStyle: { backgroundColor: "#14131c" }, headerTintColor: "#fff" }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="chat/[id]" options={{ title: "Chat" }} />
      <Stack.Screen name="user/[id]" options={{ title: "Profile" }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="light" />
        <RootNavigator />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
