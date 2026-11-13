import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "@/lib/auth";
import { Theme } from "@/lib/theme";

SplashScreen.preventAutoHideAsync();

function RootNavigator() {
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [loading]);

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: Theme.bg, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator size="large" color={Theme.brand} />
      </View>
    );
  }

  // Route guards switch the active screen in the same render as the auth change,
  // so there is no frame where the old screen is shown with the new auth state.
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: Theme.surface },
        headerTintColor: Theme.text,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: Theme.bg },
        animation: "fade",
      }}
    >
      <Stack.Protected guard={!!user}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="chat/[id]" options={{ title: "Chat", animation: "default" }} />
        <Stack.Screen name="user/[id]" options={{ title: "Profile", animation: "default" }} />
      </Stack.Protected>
      <Stack.Protected guard={!user}>
        <Stack.Screen name="login" options={{ headerShown: false }} />
      </Stack.Protected>
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
