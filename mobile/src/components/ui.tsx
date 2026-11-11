import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { mediaSrc } from "@/lib/api";
import { Theme } from "@/lib/theme";

export function hapticLight() {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

export function hapticSuccess() {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}

export function GradientAvatar({
  name,
  url,
  size = 44,
  ring = false,
}: {
  name: string;
  url?: string | null;
  size?: number;
  ring?: boolean;
}) {
  const src = mediaSrc(url);
  const innerSize = ring ? size - 4 : size;
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("") || "?";

  const content = src ? (
    <Image
      source={{ uri: src }}
      style={{ width: innerSize, height: innerSize, borderRadius: innerSize / 2 }}
      contentFit="cover"
    />
  ) : (
    <LinearGradient
      colors={["#7C5CFF", "#3B82F6", "#22D3EE"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{
        width: innerSize,
        height: innerSize,
        borderRadius: innerSize / 2,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text style={{ color: "#fff", fontWeight: "800", fontSize: Math.max(12, Math.round(innerSize * 0.36)) }}>
        {initials}
      </Text>
    </LinearGradient>
  );

  if (!ring) return content;

  return (
    <LinearGradient
      colors={["#7C5CFF", "#22D3EE"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        padding: 2,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {content}
    </LinearGradient>
  );
}

export function GradientButton({
  label,
  onPress,
  disabled,
  loading,
  icon,
  style,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      onPress={() => {
        hapticLight();
        onPress();
      }}
      disabled={disabled || loading}
      style={({ pressed }) => [
        { borderRadius: 14, overflow: "hidden", opacity: disabled ? 0.5 : pressed ? 0.88 : 1 },
        style,
      ]}
    >
      <LinearGradient
        colors={["#7C5CFF", "#5A4BFF", "#2563EB"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.gradBtn}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <View style={styles.gradBtnInner}>
            {icon && <Ionicons name={icon} size={17} color="#fff" />}
            <Text style={styles.gradBtnText}>{label}</Text>
          </View>
        )}
      </LinearGradient>
    </Pressable>
  );
}

export function EmptyView({
  icon,
  title,
  subtitle,
  actionLabel,
  onAction,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.emptyWrap}>
      <View style={styles.emptyIconCircle}>
        <Ionicons name={icon} size={28} color={Theme.accent} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      {!!subtitle && <Text style={styles.emptySub}>{subtitle}</Text>}
      {actionLabel && onAction && (
        <GradientButton label={actionLabel} onPress={onAction} style={{ marginTop: 6, minWidth: 160 }} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  gradBtn: {
    paddingVertical: 14,
    paddingHorizontal: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  gradBtnInner: { flexDirection: "row", alignItems: "center", gap: 8 },
  gradBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  emptyWrap: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 48,
    paddingHorizontal: 28,
    gap: 10,
  },
  emptyIconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: Theme.accentSoft,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(34,211,238,0.28)",
  },
  emptyTitle: { color: Theme.text, fontSize: 16, fontWeight: "700", textAlign: "center" },
  emptySub: { color: Theme.textMuted, fontSize: 13, textAlign: "center", lineHeight: 19 },
});
