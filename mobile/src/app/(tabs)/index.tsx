import { Ionicons } from "@expo/vector-icons";
import { useEventListener } from "expo";
import { Image } from "expo-image";
import { useFocusEffect, useRouter } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api, formatTime, mediaSrc, timeAgo, type Comment, type Page, type Video } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Theme } from "@/lib/theme";

const REPORT_REASONS = ["Inappropriate content", "Spam or misleading", "Harassment or hate", "Audio / video issue"];

function ReelItem({
  item,
  height,
  isActive,
  muted,
  onToggleMute,
  onLike,
  onSave,
  onOpenComments,
  onOpenReport,
  onOpenProfile,
}: {
  item: Video;
  height: number;
  isActive: boolean;
  muted: boolean;
  onToggleMute: () => void;
  onLike: (v: Video) => void;
  onSave: (v: Video) => void;
  onOpenComments: (v: Video) => void;
  onOpenReport: (v: Video) => void;
  onOpenProfile: (userId: number) => void;
}) {
  const src = mediaSrc(item.video_url, item.status) ?? null;
  const thumb = mediaSrc(item.thumbnail_url, item.status);
  const [pausedByUser, setPausedByUser] = useState(false);
  const [progress, setProgress] = useState(0);
  const viewRecorded = useRef(false);

  const player = useVideoPlayer(src, (p) => {
    p.loop = true;
    p.muted = muted;
    p.timeUpdateEventInterval = 0.35;
  });

  useEventListener(player, "timeUpdate", ({ currentTime }) => {
    const dur = player.duration || item.duration_seconds || 0;
    if (dur > 0) setProgress(Math.min(1, currentTime / dur));
  });

  useEffect(() => {
    player.muted = muted;
  }, [player, muted]);

  useEffect(() => {
    if (isActive && !pausedByUser) {
      player.play();
      if (!viewRecorded.current && item.status === "approved") {
        viewRecorded.current = true;
        api(`/videos/${item.id}/view`, { method: "POST" }).catch(() => {});
      }
    } else {
      player.pause();
    }
  }, [player, isActive, pausedByUser, item.id, item.status]);

  const togglePlay = () => {
    if (player.playing) {
      player.pause();
      setPausedByUser(true);
    } else {
      setPausedByUser(false);
      player.play();
    }
  };

  return (
    <View style={[styles.reel, { height }]}>
      {thumb && <Image source={{ uri: thumb }} style={StyleSheet.absoluteFill} contentFit="cover" />}
      <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="contain" nativeControls={false} />
      <Pressable style={StyleSheet.absoluteFill} onPress={togglePlay}>
        {pausedByUser && (
          <View style={styles.pauseOverlay}>
            <View style={styles.playCircle}>
              <Ionicons name="play" size={42} color="#fff" style={{ marginLeft: 4 }} />
            </View>
          </View>
        )}
      </Pressable>

      {/* Subtle layered bottom scrim for crisp caption readability */}
      <View pointerEvents="none" style={styles.scrimTop} />
      <View pointerEvents="none" style={styles.scrimBottom} />

      {/* Right action rail */}
      <View style={styles.rail}>
        <Pressable style={styles.railBtn} onPress={() => onLike(item)}>
          <View style={[styles.railIconCircle, item.liked_by_me && styles.railIconLiked]}>
            <Ionicons name={item.liked_by_me ? "heart" : "heart-outline"} size={24} color={item.liked_by_me ? "#ff4757" : "#fff"} />
          </View>
          <Text style={styles.railText}>{item.like_count}</Text>
        </Pressable>

        <Pressable style={styles.railBtn} onPress={() => onOpenComments(item)}>
          <View style={styles.railIconCircle}>
            <Ionicons name="chatbubble-ellipses-outline" size={23} color="#fff" />
          </View>
          <Text style={styles.railText}>{item.comment_count}</Text>
        </Pressable>

        <Pressable style={styles.railBtn} onPress={() => onSave(item)}>
          <View style={[styles.railIconCircle, item.saved_by_me && styles.railIconSaved]}>
            <Ionicons name={item.saved_by_me ? "bookmark" : "bookmark-outline"} size={22} color={item.saved_by_me ? Theme.accent : "#fff"} />
          </View>
          <Text style={styles.railText}>{item.saved_by_me ? "Saved" : "Save"}</Text>
        </Pressable>

        <Pressable style={styles.railBtn} onPress={onToggleMute}>
          <View style={styles.railIconCircle}>
            <Ionicons name={muted ? "volume-mute" : "volume-high"} size={22} color="#fff" />
          </View>
          <Text style={styles.railText}>{muted ? "Muted" : "Sound"}</Text>
        </Pressable>

        <Pressable style={styles.railBtn} onPress={() => onOpenReport(item)}>
          <View style={styles.railIconCircle}>
            <Ionicons name="flag-outline" size={20} color="#fff" />
          </View>
          <Text style={styles.railText}>Report</Text>
        </Pressable>
      </View>

      {/* Bottom caption */}
      <View style={styles.caption} pointerEvents="box-none">
        <Pressable onPress={() => onOpenProfile(item.owner.id)} style={styles.ownerRow}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{item.owner.display_name.slice(0, 1).toUpperCase()}</Text>
          </View>
          <Text style={styles.ownerName}>{item.owner.display_name}</Text>
          <View style={styles.followPill}>
            <Text style={styles.followPillText}>View profile</Text>
          </View>
        </Pressable>
        <Text style={styles.videoTitle}>{item.title}</Text>
        {!!item.description && (
          <Text style={styles.videoDesc} numberOfLines={2}>
            {item.description}
          </Text>
        )}
        <View style={styles.badges}>
          <View style={styles.badgePill}>
            <Text style={styles.badgeText}>{item.category}</Text>
          </View>
          <View style={styles.badgePill}>
            <Ionicons name="eye-outline" size={11} color="#fff" />
            <Text style={styles.badgeText}>{item.view_count ?? 0}</Text>
          </View>
          {item.duration_seconds != null && (
            <View style={styles.badgePill}>
              <Ionicons name="time-outline" size={11} color="#fff" />
              <Text style={styles.badgeText}>{formatTime(item.duration_seconds)}</Text>
            </View>
          )}
        </View>
      </View>

      {/* Sleek playback progress track */}
      <View style={styles.seekTrack}>
        <View style={[styles.seekFill, { width: `${Math.round(progress * 100)}%` }]} />
      </View>
    </View>
  );
}

export default function WatchScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [viewportHeight, setViewportHeight] = useState(Dimensions.get("window").height - 80);
  const [videos, setVideos] = useState<Video[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const [screenFocused, setScreenFocused] = useState(true);
  const [muted, setMuted] = useState(true);

  const [commentsFor, setCommentsFor] = useState<Video | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentText, setCommentText] = useState("");
  const [reportTarget, setReportTarget] = useState<{ type: "video" | "comment"; id: number; title: string; ownerId?: number; ownerName?: string } | null>(null);
  const [reportReason, setReportReason] = useState("");

  useFocusEffect(
    useCallback(() => {
      setScreenFocused(true);
      return () => setScreenFocused(false);
    }, []),
  );

  const loadFeed = useCallback(async (pageNum = 1, append = false) => {
    if (pageNum === 1) setLoading(true);
    else setLoadingMore(true);
    try {
      const res = await api<Page<Video>>(`/videos?page=${pageNum}&page_size=8`);
      setTotal(res.total);
      setPage(pageNum);
      setVideos((prev) => {
        if (!append) return res.items;
        const ids = new Set(prev.map((x) => x.id));
        return [...prev, ...res.items.filter((x) => !ids.has(x.id))];
      });
    } catch (e) {
      Alert.alert("Feed error", (e as Error).message);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    loadFeed(1, false);
  }, [loadFeed, user?.id]);

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: Array<{ index?: number | null }> }) => {
    if (viewableItems.length > 0 && viewableItems[0].index != null) {
      setActiveIdx(viewableItems[0].index);
    }
  }).current;

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 60 }).current;

  const handleLoadMore = () => {
    if (!loadingMore && videos.length < total) {
      loadFeed(page + 1, true);
    }
  };

  const handleLike = async (v: Video) => {
    try {
      const res = await api<{ liked: boolean; like_count: number }>(`/videos/${v.id}/likes`, {
        method: v.liked_by_me ? "DELETE" : "POST",
      });
      setVideos((prev) =>
        prev.map((item) => (item.id === v.id ? { ...item, liked_by_me: res.liked, like_count: res.like_count } : item)),
      );
    } catch (e) {
      Alert.alert("Error", (e as Error).message);
    }
  };

  const handleSave = async (v: Video) => {
    try {
      const res = await api<{ saved: boolean }>(`/videos/${v.id}/save`, {
        method: v.saved_by_me ? "DELETE" : "POST",
      });
      setVideos((prev) =>
        prev.map((item) => (item.id === v.id ? { ...item, saved_by_me: res.saved } : item)),
      );
    } catch (e) {
      Alert.alert("Error", (e as Error).message);
    }
  };

  const openComments = async (v: Video) => {
    setCommentsFor(v);
    try {
      setComments(await api<Comment[]>(`/videos/${v.id}/comments`));
    } catch {}
  };

  const postComment = async () => {
    if (!commentsFor || !commentText.trim()) return;
    try {
      await api(`/videos/${commentsFor.id}/comments`, { method: "POST", json: { body: commentText.trim() } });
      setCommentText("");
      setComments(await api<Comment[]>(`/videos/${commentsFor.id}/comments`));
      setVideos((prev) =>
        prev.map((v) => (v.id === commentsFor.id ? { ...v, comment_count: v.comment_count + 1 } : v)),
      );
    } catch (e) {
      Alert.alert("Error", (e as Error).message);
    }
  };

  const submitReport = async () => {
    if (!reportTarget || reportReason.trim().length < 3) return;
    try {
      await api("/reports", {
        method: "POST",
        json: { target_type: reportTarget.type, target_id: reportTarget.id, reason: reportReason.trim() },
      });
      setReportTarget(null);
      setReportReason("");
      Alert.alert("Reported", "Thank you. Moderators will review this shortly.");
    } catch (e) {
      Alert.alert("Error", (e as Error).message);
    }
  };

  const blockCreator = async (creatorId: number, name: string) => {
    if (user?.is_guest) {
      Alert.alert("Account required", "Create an account to block creators.");
      return;
    }
    try {
      await api(`/users/${creatorId}/block`, { method: "POST" });
      setReportTarget(null);
      setVideos((prev) => prev.filter((v) => v.owner.id !== creatorId));
      Alert.alert("Blocked", `${name} has been blocked and their videos are hidden.`);
      loadFeed(1, false);
    } catch (e) {
      Alert.alert("Error", (e as Error).message);
    }
  };

  return (
    <View
      style={styles.screen}
      onLayout={(e) => {
        const h = e.nativeEvent.layout.height;
        if (h > 0) setViewportHeight(h);
      }}
    >
      {loading && videos.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Theme.brand} />
        </View>
      ) : videos.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="film-outline" size={44} color={Theme.textMuted} />
          <Text style={styles.emptyTitle}>No published videos yet</Text>
          <Pressable style={styles.refreshBtn} onPress={() => loadFeed(1, false)}>
            <Text style={styles.refreshText}>Refresh feed</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={videos}
          keyExtractor={(item) => String(item.id)}
          pagingEnabled
          showsVerticalScrollIndicator={false}
          snapToInterval={viewportHeight}
          snapToAlignment="start"
          decelerationRate="fast"
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.6}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
          refreshing={loading}
          onRefresh={() => loadFeed(1, false)}
          renderItem={({ item, index }) => {
            const near = Math.abs(index - activeIdx) <= 1;
            if (!near) {
              const thumb = mediaSrc(item.thumbnail_url, item.status);
              return (
                <View style={[styles.reel, { height: viewportHeight }]}>
                  {thumb && <Image source={{ uri: thumb }} style={StyleSheet.absoluteFill} contentFit="cover" />}
                </View>
              );
            }
            return (
              <ReelItem
                item={item}
                height={viewportHeight}
                isActive={screenFocused && index === activeIdx}
                muted={muted}
                onToggleMute={() => setMuted((m) => !m)}
                onLike={handleLike}
                onSave={handleSave}
                onOpenComments={openComments}
                onOpenReport={(v) => {
                  setReportReason("");
                  setReportTarget({ type: "video", id: v.id, title: v.title, ownerId: v.owner.id, ownerName: v.owner.display_name });
                }}
                onOpenProfile={(uid) => router.push(`/user/${uid}`)}
              />
            );
          }}
        />
      )}

      {videos.length > 0 && (
        <View style={[styles.counterPill, { top: Math.max(insets.top + 8, 16) }]}>
          <Text style={styles.counterText}>
            {activeIdx + 1} / {Math.max(total, videos.length)}
          </Text>
        </View>
      )}
      <View style={[styles.brandPill, { top: Math.max(insets.top + 8, 16) }]}>
        <Image source={require("@/assets/images/logo.png")} style={styles.brandLogo} contentFit="cover" />
        <Text style={styles.brandText}>ConnectSphere</Text>
      </View>

      {/* Comments bottom sheet */}
      <Modal visible={!!commentsFor} animationType="slide" transparent onRequestClose={() => setCommentsFor(null)}>
        <KeyboardAvoidingView style={styles.modalBackdrop} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={styles.modalSheet}>
            <View style={styles.sheetHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Comments ({commentsFor?.comment_count ?? 0})</Text>
              <Pressable onPress={() => setCommentsFor(null)} style={styles.closeBtn}>
                <Ionicons name="close" size={20} color={Theme.text} />
              </Pressable>
            </View>
            <FlatList
              data={comments}
              keyExtractor={(c) => String(c.id)}
              style={{ flex: 1 }}
              ListEmptyComponent={<Text style={styles.emptyModal}>No comments yet. Start the conversation.</Text>}
              renderItem={({ item: c }) => (
                <View style={styles.commentRow}>
                  <View style={styles.commentAvatar}>
                    <Text style={styles.commentAvatarText}>{c.author.display_name.slice(0, 1).toUpperCase()}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.commentAuthor}>
                      {c.author.display_name} <Text style={styles.commentTime}>· {timeAgo(c.created_at)}</Text>
                    </Text>
                    <Text style={styles.commentBody}>{c.body}</Text>
                  </View>
                  {user && user.id !== c.author.id && (
                    <Pressable
                      onPress={() => {
                        setReportReason("");
                        setReportTarget({ type: "comment", id: c.id, title: c.body });
                      }}
                      style={{ padding: 6 }}
                    >
                      <Ionicons name="flag-outline" size={16} color={Theme.textMuted} />
                    </Pressable>
                  )}
                </View>
              )}
            />
            <View style={styles.composerRow}>
              <TextInput
                style={styles.composerInput}
                placeholder="Add a comment..."
                placeholderTextColor={Theme.textMuted}
                value={commentText}
                onChangeText={setCommentText}
              />
              <Pressable style={styles.sendBtn} onPress={postComment}>
                <Ionicons name="send" size={18} color="#fff" />
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Report / Block modal */}
      <Modal visible={!!reportTarget} animationType="fade" transparent onRequestClose={() => setReportTarget(null)}>
        <View style={styles.centerBackdrop}>
          <View style={styles.dialog}>
            <Text style={styles.modalTitle}>
              {reportTarget?.type === "video" ? "Report or block" : "Report comment"}
            </Text>
            <View style={styles.chipWrap}>
              {REPORT_REASONS.map((r) => (
                <Pressable key={r} onPress={() => setReportReason(r)} style={[styles.reasonChip, reportReason === r && styles.reasonChipActive]}>
                  <Text style={[styles.reasonChipText, reportReason === r && { color: Theme.text }]}>{r}</Text>
                </Pressable>
              ))}
            </View>
            <TextInput
              style={styles.reasonInput}
              multiline
              placeholder="Describe the issue..."
              placeholderTextColor={Theme.textMuted}
              value={reportReason}
              onChangeText={setReportReason}
            />
            <View style={styles.dialogActions}>
              {reportTarget?.type === "video" && reportTarget.ownerId && user && user.id !== reportTarget.ownerId && !user.is_guest && (
                <Pressable style={styles.blockBtn} onPress={() => blockCreator(reportTarget.ownerId!, reportTarget.ownerName || "creator")}>
                  <Text style={styles.blockBtnText}>Block {reportTarget.ownerName}</Text>
                </Pressable>
              )}
              <Pressable style={styles.cancelBtn} onPress={() => setReportTarget(null)}>
                <Text style={{ color: Theme.textSecondary }}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.sendBtn, reportReason.trim().length < 3 && { opacity: 0.5 }]}
                disabled={reportReason.trim().length < 3}
                onPress={submitReport}
              >
                <Text style={{ color: "#fff", fontWeight: "700" }}>Send</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#000" },
  center: { flex: 1, backgroundColor: Theme.bg, alignItems: "center", justifyContent: "center", gap: 12 },
  emptyTitle: { color: Theme.text, fontSize: 16, fontWeight: "600" },
  refreshBtn: { backgroundColor: Theme.brand, paddingHorizontal: 18, paddingVertical: 11, borderRadius: 12 },
  refreshText: { color: "#fff", fontWeight: "700" },
  reel: { width: "100%", backgroundColor: "#000", position: "relative" },
  pauseOverlay: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.28)" },
  playCircle: { width: 74, height: 74, borderRadius: 37, backgroundColor: "rgba(18,20,31,0.75)", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.22)" },
  scrimTop: { position: "absolute", top: 0, left: 0, right: 0, height: 96, backgroundColor: "rgba(0,0,0,0.28)" },
  scrimBottom: { position: "absolute", bottom: 0, left: 0, right: 0, height: 220, backgroundColor: "rgba(0,0,0,0.48)" },
  counterPill: { position: "absolute", left: 16, backgroundColor: "rgba(12,14,22,0.72)", paddingHorizontal: 11, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: "rgba(255,255,255,0.14)" },
  counterText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  brandPill: { position: "absolute", right: 16, flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(12,14,22,0.72)", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1, borderColor: "rgba(255,255,255,0.14)" },
  brandLogo: { width: 18, height: 18, borderRadius: 5 },
  brandText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  rail: { position: "absolute", right: 12, bottom: 32, alignItems: "center", gap: 14 },
  railBtn: { alignItems: "center", gap: 4 },
  railIconCircle: { width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(12,14,22,0.62)", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.14)" },
  railIconLiked: { backgroundColor: "rgba(255,71,87,0.2)", borderColor: "rgba(255,71,87,0.5)" },
  railIconSaved: { backgroundColor: Theme.accentSoft, borderColor: "rgba(34,211,238,0.5)" },
  railText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  caption: { position: "absolute", left: 14, right: 78, bottom: 20, gap: 6 },
  ownerRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  avatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: Theme.brand, alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: "rgba(255,255,255,0.4)" },
  avatarText: { color: "#fff", fontWeight: "800" },
  ownerName: { color: "#fff", fontWeight: "700", fontSize: 14 },
  followPill: { backgroundColor: "rgba(255,255,255,0.16)", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  followPillText: { color: "#fff", fontSize: 10, fontWeight: "700" },
  videoTitle: { color: "#fff", fontSize: 16, fontWeight: "700" },
  videoDesc: { color: "rgba(255,255,255,0.86)", fontSize: 13 },
  badges: { flexDirection: "row", gap: 6, marginTop: 2, flexWrap: "wrap" },
  badgePill: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(255,255,255,0.18)", paddingHorizontal: 9, paddingVertical: 4, borderRadius: 12 },
  badgeText: { color: "#fff", fontSize: 11, fontWeight: "600" },
  seekTrack: { position: "absolute", left: 0, right: 0, bottom: 0, height: 3, backgroundColor: "rgba(255,255,255,0.22)" },
  seekFill: { height: 3, backgroundColor: Theme.accent },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.65)", justifyContent: "flex-end" },
  centerBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "center", padding: 20 },
  modalSheet: { backgroundColor: Theme.surface, height: "68%", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 16, borderTopWidth: 1, borderColor: Theme.border },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: Theme.borderStrong, alignSelf: "center", marginBottom: 10 },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  modalTitle: { color: Theme.text, fontSize: 17, fontWeight: "700" },
  closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: Theme.surfaceElevated, alignItems: "center", justifyContent: "center" },
  emptyModal: { color: Theme.textMuted, textAlign: "center", marginTop: 32 },
  commentRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Theme.border },
  commentAvatar: { width: 30, height: 30, borderRadius: 15, backgroundColor: Theme.surfaceElevated, alignItems: "center", justifyContent: "center" },
  commentAvatarText: { color: Theme.text, fontWeight: "700", fontSize: 12 },
  commentAuthor: { color: Theme.text, fontWeight: "700", fontSize: 13 },
  commentTime: { color: Theme.textMuted, fontWeight: "400", fontSize: 11 },
  commentBody: { color: Theme.textSecondary, fontSize: 14, marginTop: 2 },
  composerRow: { flexDirection: "row", gap: 8, paddingTop: 10 },
  composerInput: { flex: 1, backgroundColor: Theme.bg, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, color: Theme.text, borderWidth: 1, borderColor: Theme.border },
  sendBtn: { backgroundColor: Theme.brand, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, justifyContent: "center", alignItems: "center" },
  dialog: { backgroundColor: Theme.surface, borderRadius: 20, padding: 18, gap: 12, borderWidth: 1, borderColor: Theme.border },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  reasonChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, backgroundColor: Theme.bg, borderWidth: 1, borderColor: Theme.border },
  reasonChipActive: { backgroundColor: Theme.brandSoft, borderColor: Theme.brand },
  reasonChipText: { color: Theme.textMuted, fontSize: 12, fontWeight: "600" },
  reasonInput: { backgroundColor: Theme.bg, borderRadius: 12, padding: 12, color: Theme.text, minHeight: 76, textAlignVertical: "top", borderWidth: 1, borderColor: Theme.border },
  dialogActions: { flexDirection: "row", justifyContent: "flex-end", gap: 8, flexWrap: "wrap", alignItems: "center" },
  blockBtn: { backgroundColor: Theme.dangerSoft, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, marginRight: "auto" },
  blockBtnText: { color: Theme.danger, fontWeight: "700", fontSize: 12 },
  cancelBtn: { paddingHorizontal: 12, paddingVertical: 10 },
});
