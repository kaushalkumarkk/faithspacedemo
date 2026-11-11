import { Ionicons } from "@expo/vector-icons";
import { useEventListener } from "expo";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { EmptyView, GradientAvatar, hapticLight, hapticSuccess } from "@/components/ui";
import { api, CATEGORIES, formatTime, mediaSrc, timeAgo, type Comment, type Page, type Video } from "@/lib/api";
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
  onLike: (v: Video, forceLike?: boolean) => void;
  onSave: (v: Video) => void;
  onOpenComments: (v: Video) => void;
  onOpenReport: (v: Video) => void;
  onOpenProfile: (userId: number) => void;
}) {
  const src = mediaSrc(item.video_url, item.status) ?? null;
  const thumb = mediaSrc(item.thumbnail_url, item.status);
  const [pausedByUser, setPausedByUser] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [totalDur, setTotalDur] = useState(item.duration_seconds ?? 0);
  const viewRecorded = useRef(false);
  const lastTap = useRef(0);
  const tapTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartScale = useRef(new Animated.Value(0)).current;
  const heartOpacity = useRef(new Animated.Value(0)).current;

  const player = useVideoPlayer(src, (p) => {
    p.loop = true;
    p.muted = muted;
    p.timeUpdateEventInterval = 0.25;
  });

  useEventListener(player, "timeUpdate", ({ currentTime }) => {
    setElapsed(currentTime);
    if (player.duration > 0) setTotalDur(player.duration);
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

  useEffect(() => {
    return () => {
      if (tapTimeout.current) clearTimeout(tapTimeout.current);
    };
  }, []);

  const triggerHeartBurst = () => {
    heartScale.setValue(0.4);
    heartOpacity.setValue(1);
    Animated.parallel([
      Animated.spring(heartScale, { toValue: 1.25, friction: 4, useNativeDriver: true }),
      Animated.timing(heartOpacity, { toValue: 0, duration: 750, delay: 180, useNativeDriver: true }),
    ]).start();
  };

  const handleVideoTap = () => {
    const now = Date.now();
    if (now - lastTap.current < 260) {
      if (tapTimeout.current) clearTimeout(tapTimeout.current);
      lastTap.current = 0;
      hapticSuccess();
      triggerHeartBurst();
      if (!item.liked_by_me) onLike(item, true);
      return;
    }
    lastTap.current = now;
    tapTimeout.current = setTimeout(() => {
      hapticLight();
      if (player.playing) {
        player.pause();
        setPausedByUser(true);
      } else {
        setPausedByUser(false);
        player.play();
      }
    }, 260);
  };

  const pct = totalDur > 0 ? Math.min(100, (elapsed / totalDur) * 100) : 0;

  return (
    <View style={[styles.reel, { height }]}>
      {thumb && <Image source={{ uri: thumb }} style={StyleSheet.absoluteFill} contentFit="cover" />}
      <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="contain" nativeControls={false} />
      <Pressable style={StyleSheet.absoluteFill} onPress={handleVideoTap}>
        {pausedByUser && (
          <View style={styles.pauseOverlay}>
            <View style={styles.playCircle}>
              <Ionicons name="play" size={40} color="#fff" style={{ marginLeft: 4 }} />
            </View>
          </View>
        )}
        <Animated.View
          pointerEvents="none"
          style={[styles.heartBurst, { opacity: heartOpacity, transform: [{ scale: heartScale }] }]}
        >
          <Ionicons name="heart" size={96} color="#ff4757" />
        </Animated.View>
      </Pressable>

      <LinearGradient
        pointerEvents="none"
        colors={["rgba(0,0,0,0.62)", "rgba(0,0,0,0)"]}
        style={styles.scrimTop}
      />
      <LinearGradient
        pointerEvents="none"
        colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.45)", "rgba(0,0,0,0.88)"]}
        locations={[0, 0.45, 1]}
        style={styles.scrimBottom}
      />

      {/* Right action rail */}
      <View style={styles.rail}>
        <Pressable style={styles.railBtn} onPress={() => { hapticLight(); onLike(item); }}>
          <View style={[styles.railIconCircle, item.liked_by_me && styles.railIconLiked]}>
            <Ionicons name={item.liked_by_me ? "heart" : "heart-outline"} size={24} color={item.liked_by_me ? "#ff4757" : "#fff"} />
          </View>
          <Text style={styles.railText}>{item.like_count}</Text>
        </Pressable>

        <Pressable style={styles.railBtn} onPress={() => { hapticLight(); onOpenComments(item); }}>
          <View style={styles.railIconCircle}>
            <Ionicons name="chatbubble-ellipses-outline" size={22} color="#fff" />
          </View>
          <Text style={styles.railText}>{item.comment_count}</Text>
        </Pressable>

        <Pressable style={styles.railBtn} onPress={() => { hapticLight(); onSave(item); }}>
          <View style={[styles.railIconCircle, item.saved_by_me && styles.railIconSaved]}>
            <Ionicons name={item.saved_by_me ? "bookmark" : "bookmark-outline"} size={22} color={item.saved_by_me ? Theme.accent : "#fff"} />
          </View>
          <Text style={styles.railText}>{item.saved_by_me ? "Saved" : "Save"}</Text>
        </Pressable>

        <Pressable style={styles.railBtn} onPress={() => { hapticLight(); onToggleMute(); }}>
          <View style={styles.railIconCircle}>
            <Ionicons name={muted ? "volume-mute" : "volume-high"} size={21} color="#fff" />
          </View>
          <Text style={styles.railText}>{muted ? "Muted" : "Sound"}</Text>
        </Pressable>

        <Pressable style={styles.railBtn} onPress={() => { hapticLight(); onOpenReport(item); }}>
          <View style={styles.railIconCircle}>
            <Ionicons name="flag-outline" size={19} color="#fff" />
          </View>
          <Text style={styles.railText}>Report</Text>
        </Pressable>
      </View>

      {/* Bottom caption */}
      <View style={styles.caption} pointerEvents="box-none">
        <Pressable onPress={() => onOpenProfile(item.owner.id)} style={styles.ownerRow}>
          <GradientAvatar name={item.owner.display_name} url={item.owner.avatar_url} size={36} ring />
          <Text style={styles.ownerName}>{item.owner.display_name}</Text>
          <View style={styles.profilePill}>
            <Text style={styles.profilePillText}>Profile</Text>
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
          {totalDur > 0 && (
            <View style={styles.badgePill}>
              <Ionicons name="time-outline" size={11} color="#fff" />
              <Text style={styles.badgeText}>
                {formatTime(elapsed)} / {formatTime(totalDur)}
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* Playback progress bar */}
      <View style={styles.seekTrack}>
        <LinearGradient
          colors={[Theme.brand, Theme.accent]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[styles.seekFill, { width: `${pct}%` }]}
        />
      </View>
    </View>
  );
}

export default function WatchScreen() {
  const { user } = useAuth();
  const { v: deepLinkId } = useLocalSearchParams<{ v?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [viewportHeight, setViewportHeight] = useState(Dimensions.get("window").height - 80);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
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
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  const [reportTarget, setReportTarget] = useState<{ type: "video" | "comment"; id: number; title: string; ownerId?: number; ownerName?: string } | null>(null);
  const [reportReason, setReportReason] = useState("");

  useFocusEffect(
    useCallback(() => {
      setScreenFocused(true);
      return () => setScreenFocused(false);
    }, []),
  );

  const loadFeed = useCallback(async (pageNum = 1, append = false, cat = selectedCategory) => {
    if (pageNum === 1) setLoading(true);
    else setLoadingMore(true);
    try {
      const catQuery = cat ? `&category=${encodeURIComponent(cat)}` : "";
      const res = await api<Page<Video>>(`/videos?page=${pageNum}&page_size=8${catQuery}`);
      setTotal(res.total);
      setPage(pageNum);
      let items = res.items;
      if (pageNum === 1 && deepLinkId && !cat) {
        const targetId = Number(deepLinkId);
        const existingIdx = items.findIndex((x) => x.id === targetId);
        if (existingIdx > 0) {
          items = [items[existingIdx], ...items.slice(0, existingIdx), ...items.slice(existingIdx + 1)];
        } else if (existingIdx === -1) {
          try {
            const deepVid = await api<Video>(`/videos/${targetId}`);
            items = [deepVid, ...items];
          } catch {}
        }
      }
      setVideos((prev) => {
        if (!append) return items;
        const ids = new Set(prev.map((x) => x.id));
        return [...prev, ...items.filter((x) => !ids.has(x.id))];
      });
    } catch (e) {
      Alert.alert("Feed error", (e as Error).message);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [selectedCategory, deepLinkId]);

  useEffect(() => {
    setActiveIdx(0);
    loadFeed(1, false, selectedCategory);
  }, [loadFeed, user?.id, selectedCategory]);

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: Array<{ index?: number | null }> }) => {
    if (viewableItems.length > 0 && viewableItems[0].index != null) {
      setActiveIdx(viewableItems[0].index);
    }
  }).current;

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 60 }).current;

  const handleLoadMore = () => {
    if (!loadingMore && videos.length < total) {
      loadFeed(page + 1, true, selectedCategory);
    }
  };

  const handleLike = async (v: Video, forceLike = false) => {
    if (forceLike && v.liked_by_me) return;
    try {
      const res = await api<{ liked: boolean; like_count: number }>(`/videos/${v.id}/likes`, {
        method: v.liked_by_me && !forceLike ? "DELETE" : "POST",
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
    setReplyTo(null);
    try {
      setComments(await api<Comment[]>(`/videos/${v.id}/comments`));
    } catch {}
  };

  const postComment = async () => {
    if (!commentsFor || !commentText.trim()) return;
    try {
      await api(`/videos/${commentsFor.id}/comments`, {
        method: "POST",
        json: { body: commentText.trim(), parent_id: replyTo?.id ?? null },
      });
      hapticSuccess();
      setCommentText("");
      setReplyTo(null);
      setComments(await api<Comment[]>(`/videos/${commentsFor.id}/comments`));
      setVideos((prev) =>
        prev.map((v) => (v.id === commentsFor.id ? { ...v, comment_count: v.comment_count + 1 } : v)),
      );
    } catch (e) {
      Alert.alert("Error", (e as Error).message);
    }
  };

  const deleteComment = async (cid: number) => {
    if (!commentsFor) return;
    try {
      await api(`/comments/${cid}`, { method: "DELETE" });
      setComments(await api<Comment[]>(`/videos/${commentsFor.id}/comments`));
      setVideos((prev) =>
        prev.map((v) => (v.id === commentsFor.id ? { ...v, comment_count: Math.max(0, v.comment_count - 1) } : v)),
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
      hapticSuccess();
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
      loadFeed(1, false, selectedCategory);
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
          <EmptyView
            icon="film-outline"
            title={selectedCategory ? `No ${selectedCategory} videos yet` : "No published videos yet"}
            subtitle="Check back soon or try another category."
            actionLabel={selectedCategory ? "Show all categories" : "Refresh"}
            onAction={() => (selectedCategory ? setSelectedCategory(null) : loadFeed(1, false, null))}
          />
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
          onRefresh={() => loadFeed(1, false, selectedCategory)}
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

      {/* Top overlay: ConnectSphere badge + category chips */}
      <View style={[styles.topOverlay, { top: Math.max(insets.top + 6, 12) }]} pointerEvents="box-none">
        <View style={styles.topRow} pointerEvents="box-none">
          <View />
          <View style={styles.brandPill}>
            <Image source={require("@/assets/images/logo.png")} style={styles.brandLogo} contentFit="cover" />
            <Text style={styles.brandText}>ConnectSphere</Text>
          </View>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.catScroll}>
          {[null, ...CATEGORIES].map((cat) => {
            const active = selectedCategory === cat;
            return (
              <Pressable
                key={cat ?? "all"}
                onPress={() => {
                  hapticLight();
                  setSelectedCategory(cat);
                }}
                style={[styles.catPill, active && styles.catPillActive]}
              >
                <Text style={[styles.catPillText, active && { color: "#fff" }]}>{cat ?? "All"}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
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
                <View style={styles.commentGroup}>
                  <View style={styles.commentRow}>
                    <GradientAvatar name={c.author.display_name} url={c.author.avatar_url} size={32} />
                    <View style={{ flex: 1, gap: 3 }}>
                      <Text style={styles.commentAuthor}>
                        {c.author.display_name} <Text style={styles.commentTime}>· {timeAgo(c.created_at)}</Text>
                      </Text>
                      <Text style={styles.commentBody}>{c.body}</Text>
                      <View style={styles.commentActions}>
                        <Pressable onPress={() => setReplyTo(c)}>
                          <Text style={styles.commentActionText}>Reply</Text>
                        </Pressable>
                        {user && (user.id === c.author.id || user.role === "admin") && (
                          <Pressable onPress={() => deleteComment(c.id)}>
                            <Text style={[styles.commentActionText, { color: Theme.danger }]}>Delete</Text>
                          </Pressable>
                        )}
                      </View>
                    </View>
                    {user && user.id !== c.author.id && (
                      <Pressable
                        onPress={() => {
                          setReportReason("");
                          setReportTarget({ type: "comment", id: c.id, title: c.body });
                        }}
                        style={{ padding: 6 }}
                      >
                        <Ionicons name="flag-outline" size={15} color={Theme.textMuted} />
                      </Pressable>
                    )}
                  </View>
                  {c.replies?.map((r) => (
                    <View key={r.id} style={styles.replyRow}>
                      <GradientAvatar name={r.author.display_name} url={r.author.avatar_url} size={24} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.commentAuthor}>
                          {r.author.display_name} <Text style={styles.commentTime}>· {timeAgo(r.created_at)}</Text>
                        </Text>
                        <Text style={styles.commentBody}>{r.body}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            />
            {replyTo && (
              <View style={styles.replyBanner}>
                <Text style={styles.replyBannerText}>Replying to {replyTo.author.display_name}</Text>
                <Pressable onPress={() => setReplyTo(null)}>
                  <Ionicons name="close-circle" size={16} color={Theme.textMuted} />
                </Pressable>
              </View>
            )}
            <View style={styles.composerRow}>
              <TextInput
                style={styles.composerInput}
                placeholder={replyTo ? "Write a reply..." : "Add a comment..."}
                placeholderTextColor={Theme.textMuted}
                value={commentText}
                onChangeText={setCommentText}
              />
              <Pressable style={[styles.sendBtn, !commentText.trim() && { opacity: 0.5 }]} onPress={postComment} disabled={!commentText.trim()}>
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
  center: { flex: 1, backgroundColor: Theme.bg, alignItems: "center", justifyContent: "center" },
  reel: { width: "100%", backgroundColor: "#000", position: "relative" },
  pauseOverlay: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.28)" },
  playCircle: { width: 72, height: 72, borderRadius: 36, backgroundColor: "rgba(18,20,31,0.78)", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.24)" },
  heartBurst: { position: "absolute", top: "42%", left: "50%", marginLeft: -48, marginTop: -48 },
  scrimTop: { position: "absolute", top: 0, left: 0, right: 0, height: 130 },
  scrimBottom: { position: "absolute", bottom: 0, left: 0, right: 0, height: 260 },
  topOverlay: { position: "absolute", left: 0, right: 0, gap: 10 },
  topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 14 },
  counterPill: { backgroundColor: "rgba(12,14,22,0.68)", paddingHorizontal: 11, paddingVertical: 5, borderRadius: 20, borderWidth: 1, borderColor: "rgba(255,255,255,0.16)" },
  counterText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  brandPill: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(12,14,22,0.68)", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1, borderColor: "rgba(255,255,255,0.16)" },
  brandLogo: { width: 18, height: 18, borderRadius: 5 },
  brandText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  catScroll: { paddingHorizontal: 14, gap: 6 },
  catPill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: "rgba(12,14,22,0.56)", borderWidth: 1, borderColor: "rgba(255,255,255,0.14)" },
  catPillActive: { backgroundColor: Theme.brand, borderColor: Theme.brand },
  catPillText: { color: "rgba(255,255,255,0.8)", fontSize: 12, fontWeight: "700" },
  rail: { position: "absolute", right: 12, bottom: 28, alignItems: "center", gap: 13 },
  railBtn: { alignItems: "center", gap: 4 },
  railIconCircle: { width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(12,14,22,0.62)", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.16)" },
  railIconLiked: { backgroundColor: "rgba(255,71,87,0.22)", borderColor: "rgba(255,71,87,0.55)" },
  railIconSaved: { backgroundColor: Theme.accentSoft, borderColor: "rgba(34,211,238,0.55)" },
  railText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  caption: { position: "absolute", left: 14, right: 78, bottom: 18, gap: 6 },
  ownerRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  ownerName: { color: "#fff", fontWeight: "700", fontSize: 15 },
  profilePill: { backgroundColor: "rgba(255,255,255,0.18)", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  profilePillText: { color: "#fff", fontSize: 10, fontWeight: "700" },
  videoTitle: { color: "#fff", fontSize: 16, fontWeight: "700" },
  videoDesc: { color: "rgba(255,255,255,0.88)", fontSize: 13 },
  badges: { flexDirection: "row", gap: 6, marginTop: 2, flexWrap: "wrap" },
  badgePill: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(255,255,255,0.18)", paddingHorizontal: 9, paddingVertical: 4, borderRadius: 12 },
  badgeText: { color: "#fff", fontSize: 11, fontWeight: "600" },
  seekTrack: { position: "absolute", left: 0, right: 0, bottom: 0, height: 3, backgroundColor: "rgba(255,255,255,0.22)" },
  seekFill: { height: 3 },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.65)", justifyContent: "flex-end" },
  centerBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "center", padding: 20 },
  modalSheet: { backgroundColor: Theme.surface, height: "72%", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 16, borderTopWidth: 1, borderColor: Theme.border },
  sheetHandle: { width: 42, height: 4, borderRadius: 2, backgroundColor: Theme.borderStrong, alignSelf: "center", marginBottom: 10 },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  modalTitle: { color: Theme.text, fontSize: 17, fontWeight: "700" },
  closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: Theme.surfaceElevated, alignItems: "center", justifyContent: "center" },
  emptyModal: { color: Theme.textMuted, textAlign: "center", marginTop: 32 },
  commentGroup: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Theme.border, gap: 8 },
  commentRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  replyRow: { flexDirection: "row", alignItems: "flex-start", gap: 8, marginLeft: 42 },
  commentAuthor: { color: Theme.text, fontWeight: "700", fontSize: 13 },
  commentTime: { color: Theme.textMuted, fontWeight: "400", fontSize: 11 },
  commentBody: { color: Theme.textSecondary, fontSize: 14, marginTop: 1 },
  commentActions: { flexDirection: "row", gap: 14, marginTop: 4 },
  commentActionText: { color: Theme.textMuted, fontSize: 12, fontWeight: "600" },
  replyBanner: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: Theme.surfaceElevated, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, marginTop: 6 },
  replyBannerText: { color: Theme.textSecondary, fontSize: 12 },
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
