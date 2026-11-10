import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useFocusEffect, useRouter } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api, formatTime, mediaSrc, type Comment, type Page, type Video } from "@/lib/api";
import { useAuth } from "@/lib/auth";

function ReelItem({
  item,
  height,
  isActive,
  muted,
  onToggleMute,
  onLike,
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
  onOpenComments: (v: Video) => void;
  onOpenReport: (v: Video) => void;
  onOpenProfile: (userId: number) => void;
}) {
  const src = mediaSrc(item.video_url, item.status) ?? null;
  const thumb = mediaSrc(item.thumbnail_url, item.status);
  const [pausedByUser, setPausedByUser] = useState(false);

  const player = useVideoPlayer(src, (p) => {
    p.loop = true;
    p.muted = muted;
  });

  useEffect(() => {
    player.muted = muted;
  }, [player, muted]);

  useEffect(() => {
    if (isActive && !pausedByUser) {
      player.play();
    } else {
      player.pause();
    }
  }, [player, isActive, pausedByUser]);

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
            <Ionicons name="play" size={54} color="rgba(255,255,255,0.88)" />
          </View>
        )}
      </Pressable>

      {/* Right action rail */}
      <View style={styles.rail}>
        <Pressable style={styles.railBtn} onPress={() => onLike(item)}>
          <Ionicons name={item.liked_by_me ? "heart" : "heart-outline"} size={30} color={item.liked_by_me ? "#ff4757" : "#fff"} />
          <Text style={styles.railText}>{item.like_count}</Text>
        </Pressable>

        <Pressable style={styles.railBtn} onPress={() => onOpenComments(item)}>
          <Ionicons name="chatbubble-ellipses" size={28} color="#fff" />
          <Text style={styles.railText}>{item.comment_count}</Text>
        </Pressable>

        <Pressable style={styles.railBtn} onPress={onToggleMute}>
          <Ionicons name={muted ? "volume-mute" : "volume-high"} size={26} color="#fff" />
          <Text style={styles.railText}>{muted ? "Muted" : "Sound"}</Text>
        </Pressable>

        <Pressable style={styles.railBtn} onPress={() => onOpenReport(item)}>
          <Ionicons name="flag" size={24} color="#fff" />
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
        </Pressable>
        <Text style={styles.videoTitle}>{item.title}</Text>
        {!!item.description && (
          <Text style={styles.videoDesc} numberOfLines={2}>
            {item.description}
          </Text>
        )}
        <View style={styles.badges}>
          <Text style={styles.badge}>{item.category}</Text>
          {item.duration_seconds != null && <Text style={styles.badge}>{formatTime(item.duration_seconds)}</Text>}
        </View>
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
  const [reportVideo, setReportVideo] = useState<Video | null>(null);
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

  const reportComment = (c: Comment) => {
    Alert.prompt?.(
      "Report comment",
      "Why are you reporting this comment?",
      async (reason) => {
        if (!reason || reason.trim().length < 3) return;
        try {
          await api("/reports", { method: "POST", json: { target_type: "comment", target_id: c.id, reason: reason.trim() } });
          Alert.alert("Reported", "Comment sent to moderators.");
        } catch (e) {
          Alert.alert("Error", (e as Error).message);
        }
      },
    ) ??
      Alert.alert("Report comment", "Submit report as inappropriate comment?", [
        { text: "Cancel", style: "cancel" },
        {
          text: "Report",
          style: "destructive",
          onPress: async () => {
            try {
              await api("/reports", { method: "POST", json: { target_type: "comment", target_id: c.id, reason: "Reported from mobile app" } });
              Alert.alert("Reported", "Comment sent to moderators.");
            } catch (e) {
              Alert.alert("Error", (e as Error).message);
            }
          },
        },
      ]);
  };

  const submitVideoReport = async () => {
    if (!reportVideo || reportReason.trim().length < 3) return;
    try {
      await api("/reports", {
        method: "POST",
        json: { target_type: "video", target_id: reportVideo.id, reason: reportReason.trim() },
      });
      setReportVideo(null);
      setReportReason("");
      Alert.alert("Reported", "Report sent to moderators.");
    } catch (e) {
      Alert.alert("Error", (e as Error).message);
    }
  };

  const blockCreator = async (creatorId: number, name: string) => {
    try {
      await api(`/users/${creatorId}/block`, { method: "POST" });
      setReportVideo(null);
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
          <ActivityIndicator size="large" color="#7c5cff" />
        </View>
      ) : videos.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>No published videos yet</Text>
          <Pressable style={styles.refreshBtn} onPress={() => loadFeed(1, false)}>
            <Text style={styles.refreshText}>Refresh</Text>
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
                onOpenComments={openComments}
                onOpenReport={(v) => {
                  setReportReason("");
                  setReportVideo(v);
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

      {/* Comments modal */}
      <Modal visible={!!commentsFor} animationType="slide" transparent onRequestClose={() => setCommentsFor(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Comments</Text>
              <Pressable onPress={() => setCommentsFor(null)}>
                <Ionicons name="close" size={24} color="#fff" />
              </Pressable>
            </View>
            <FlatList
              data={comments}
              keyExtractor={(c) => String(c.id)}
              style={{ flex: 1 }}
              ListEmptyComponent={<Text style={styles.emptyModal}>No comments yet.</Text>}
              renderItem={({ item: c }) => (
                <View style={styles.commentRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.commentAuthor}>{c.author.display_name}</Text>
                    <Text style={styles.commentBody}>{c.body}</Text>
                  </View>
                  {user && user.id !== c.author.id && (
                    <Pressable onPress={() => reportComment(c)} style={{ padding: 6 }}>
                      <Ionicons name="flag-outline" size={16} color="#9c9aa8" />
                    </Pressable>
                  )}
                </View>
              )}
            />
            <View style={styles.composerRow}>
              <TextInput
                style={styles.composerInput}
                placeholder="Add a comment..."
                placeholderTextColor="#7c7b8a"
                value={commentText}
                onChangeText={setCommentText}
              />
              <Pressable style={styles.sendBtn} onPress={postComment}>
                <Ionicons name="send" size={18} color="#fff" />
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Report / Block modal */}
      <Modal visible={!!reportVideo} animationType="fade" transparent onRequestClose={() => setReportVideo(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.dialog}>
            <Text style={styles.modalTitle}>Report or Block</Text>
            <TextInput
              style={styles.reasonInput}
              multiline
              placeholder="What's wrong with this video?"
              placeholderTextColor="#7c7b8a"
              value={reportReason}
              onChangeText={setReportReason}
            />
            <View style={styles.dialogActions}>
              {reportVideo && user && user.id !== reportVideo.owner.id && (
                <Pressable style={styles.blockBtn} onPress={() => blockCreator(reportVideo.owner.id, reportVideo.owner.display_name)}>
                  <Text style={styles.blockBtnText}>Block {reportVideo.owner.display_name}</Text>
                </Pressable>
              )}
              <Pressable style={styles.cancelBtn} onPress={() => setReportVideo(null)}>
                <Text style={{ color: "#ccc" }}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.sendBtn} onPress={submitVideoReport}>
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
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  emptyTitle: { color: "#fff", fontSize: 16, fontWeight: "600" },
  refreshBtn: { backgroundColor: "#7c5cff", paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10 },
  refreshText: { color: "#fff", fontWeight: "700" },
  reel: { width: "100%", backgroundColor: "#000", position: "relative" },
  pauseOverlay: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.25)" },
  counterPill: { position: "absolute", left: 16, backgroundColor: "rgba(0,0,0,0.6)", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  counterText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  brandPill: { position: "absolute", right: 16, flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(0,0,0,0.6)", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  brandLogo: { width: 18, height: 18, borderRadius: 5 },
  brandText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  rail: { position: "absolute", right: 12, bottom: 96, alignItems: "center", gap: 18 },
  railBtn: { alignItems: "center", gap: 3 },
  railText: { color: "#fff", fontSize: 11, fontWeight: "600" },
  caption: { position: "absolute", left: 14, right: 76, bottom: 20, gap: 6 },
  ownerRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  avatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: "#7c5cff", alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#fff", fontWeight: "800" },
  ownerName: { color: "#fff", fontWeight: "700", fontSize: 14 },
  videoTitle: { color: "#fff", fontSize: 16, fontWeight: "700" },
  videoDesc: { color: "rgba(255,255,255,0.82)", fontSize: 13 },
  badges: { flexDirection: "row", gap: 8, marginTop: 2 },
  badge: { color: "#fff", fontSize: 11, backgroundColor: "rgba(255,255,255,0.2)", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, overflow: "hidden" },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.65)", justifyContent: "flex-end" },
  modalSheet: { backgroundColor: "#171622", height: "65%", borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16 },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  modalTitle: { color: "#fff", fontSize: 17, fontWeight: "700" },
  emptyModal: { color: "#8f8da0", textAlign: "center", marginTop: 32 },
  commentRow: { flexDirection: "row", alignItems: "flex-start", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#262436" },
  commentAuthor: { color: "#fff", fontWeight: "700", fontSize: 13 },
  commentBody: { color: "#d5d4df", fontSize: 14, marginTop: 2 },
  composerRow: { flexDirection: "row", gap: 8, paddingTop: 10 },
  composerInput: { flex: 1, backgroundColor: "#0d0c12", borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, color: "#fff", borderWidth: 1, borderColor: "#2f2d42" },
  sendBtn: { backgroundColor: "#7c5cff", borderRadius: 12, paddingHorizontal: 14, justifyContent: "center", alignItems: "center" },
  dialog: { margin: 20, marginBottom: "auto", marginTop: "auto", backgroundColor: "#171622", borderRadius: 16, padding: 16, gap: 12, borderWidth: 1, borderColor: "#2f2d42" },
  reasonInput: { backgroundColor: "#0d0c12", borderRadius: 10, padding: 12, color: "#fff", minHeight: 80, textAlignVertical: "top", borderWidth: 1, borderColor: "#2f2d42" },
  dialogActions: { flexDirection: "row", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" },
  blockBtn: { backgroundColor: "#3a1b24", paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, marginRight: "auto" },
  blockBtnText: { color: "#ff6b81", fontWeight: "700", fontSize: 12 },
  cancelBtn: { paddingHorizontal: 12, paddingVertical: 10 },
});
