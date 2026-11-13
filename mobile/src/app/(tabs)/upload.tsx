import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import { createVideoPlayer, useVideoPlayer, VideoView } from "expo-video";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { GradientButton, hapticLight, hapticSuccess } from "@/components/ui";
import { api, CATEGORIES, formatTime, uploadMediaFile, type Video } from "@/lib/api";
import { Theme } from "@/lib/theme";

export default function UploadScreen() {
  const router = useRouter();
  const [submitted, setSubmitted] = useState<{ title: string } | null>(null);
  const [videoUri, setVideoUri] = useState<string | null>(null);
  const [videoName, setVideoName] = useState("video.mp4");
  const [durationSec, setDurationSec] = useState<number | null>(null);
  const [thumbUri, setThumbUri] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<string>(CATEGORIES[0]);

  const [pct, setPct] = useState(0);
  const [bgState, setBgState] = useState<"idle" | "uploading" | "ready" | "error">("idle");
  const [saving, setSaving] = useState(false);

  const videoUpRef = useRef<{ cancel: () => void; promise: Promise<number> } | null>(null);
  const thumbUpRef = useRef<{ cancel: () => void; promise: Promise<number> } | null>(null);

  const previewPlayer = useVideoPlayer(videoUri, (p) => {
    p.loop = true;
    p.muted = true;
  });

  useEffect(() => {
    return () => {
      videoUpRef.current?.cancel();
      thumbUpRef.current?.cancel();
    };
  }, []);

  const beginBackgroundVideoUpload = (uri: string, name: string, mime: string) => {
    videoUpRef.current?.cancel();
    setPct(0);
    setBgState("uploading");
    const up = uploadMediaFile("video", uri, name, mime, setPct);
    const rec = {
      cancel: up.cancel,
      promise: up.promise.then((a) => a.id),
    };
    videoUpRef.current = rec;
    rec.promise
      .then(() => {
        if (videoUpRef.current === rec) {
          setBgState("ready");
          hapticSuccess();
        }
      })
      .catch((e) => {
        if (videoUpRef.current !== rec) return;
        if ((e as { code?: string }).code === "aborted") {
          setBgState("idle");
        } else {
          setBgState("error");
        }
      });
  };

  const beginBackgroundThumbUpload = (uri: string) => {
    thumbUpRef.current?.cancel();
    const isPng = uri.toLowerCase().endsWith(".png");
    const up = uploadMediaFile(
      "image",
      uri,
      isPng ? "thumbnail.png" : "thumbnail.jpg",
      isPng ? "image/png" : "image/jpeg",
    );
    const rec = {
      cancel: up.cancel,
      promise: up.promise.then((a) => a.id),
    };
    thumbUpRef.current = rec;
    rec.promise.catch(() => {
      if (thumbUpRef.current === rec) thumbUpRef.current = null;
    });
  };

  const extractAutoThumbnail = async (uri: string) => {
    let player: ReturnType<typeof createVideoPlayer> | null = null;
    try {
      player = createVideoPlayer(uri);
      const thumbs = await player.generateThumbnailsAsync([0.5], { maxWidth: 480 });
      if (thumbs.length > 0) {
        const rendered = await ImageManipulator.manipulate(thumbs[0]).renderAsync();
        const saved = await rendered.saveAsync({ compress: 0.8, format: SaveFormat.JPEG });
        setThumbUri(saved.uri);
        beginBackgroundThumbUpload(saved.uri);
      }
    } catch {
      // Fallback: creator can select a custom thumbnail image
    } finally {
      player?.release();
    }
  };

  const handlePickedVideo = (asset: ImagePicker.ImagePickerAsset) => {
    const dur = asset.duration ? Math.round(asset.duration / 1000) : null;
    if (dur && dur > 95) {
      Alert.alert("Too long", "Please choose or record a video up to 90 seconds.");
      return;
    }
    const name = asset.fileName || `upload-${Date.now()}.mp4`;
    const mime = asset.mimeType || (name.endsWith(".webm") ? "video/webm" : "video/mp4");
    setVideoUri(asset.uri);
    setVideoName(name);
    setDurationSec(dur);
    setThumbUri(null);
    thumbUpRef.current?.cancel();
    thumbUpRef.current = null;

    beginBackgroundVideoUpload(asset.uri, name, mime);
    extractAutoThumbnail(asset.uri);
  };

  const pickVideoFromLibrary = async () => {
    hapticLight();
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission required", "Allow photo library access to pick a video.");
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["videos"],
      videoMaxDuration: 90,
      quality: 0.8,
    });
    if (!res.canceled && res.assets[0]) handlePickedVideo(res.assets[0]);
  };

  const recordVideoWithCamera = async () => {
    hapticLight();
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission required", "Allow camera access to record up to 90 seconds.");
      return;
    }
    const res = await ImagePicker.launchCameraAsync({
      mediaTypes: ["videos"],
      videoMaxDuration: 90,
      quality: 0.8,
    });
    if (!res.canceled && res.assets[0]) handlePickedVideo(res.assets[0]);
  };

  const pickCustomThumbnail = async () => {
    hapticLight();
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.85,
    });
    if (!res.canceled && res.assets[0]) {
      setThumbUri(res.assets[0].uri);
      beginBackgroundThumbUpload(res.assets[0].uri);
    }
  };

  const clearSelection = () => {
    hapticLight();
    videoUpRef.current?.cancel();
    thumbUpRef.current?.cancel();
    videoUpRef.current = null;
    thumbUpRef.current = null;
    setVideoUri(null);
    setThumbUri(null);
    setDurationSec(null);
    setBgState("idle");
    setPct(0);
  };

  const submit = async () => {
    if (!videoUri || !videoUpRef.current) {
      Alert.alert("No video", "Pick or record a video first.");
      return;
    }
    if (title.trim().length < 2) {
      Alert.alert("Title required", "Enter a title with at least 2 characters.");
      return;
    }
    setSaving(true);
    try {
      const [assetId, thumbAssetId] = await Promise.all([
        videoUpRef.current.promise,
        thumbUpRef.current ? thumbUpRef.current.promise.catch(() => null) : Promise.resolve(null),
      ]);

      await api<Video>("/videos", {
        method: "POST",
        json: {
          asset_id: assetId,
          thumbnail_asset_id: thumbAssetId,
          duration_seconds: durationSec,
          title: title.trim(),
          description: description.trim(),
          category,
        },
      });

      hapticSuccess();
      const submittedTitle = title.trim();
      clearSelection();
      setTitle("");
      setDescription("");
      setSubmitted({ title: submittedTitle });
    } catch (e) {
      Alert.alert("Upload failed", (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (submitted) {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={[styles.container, { paddingTop: 40 }]}>
        <View style={[styles.card, { alignItems: "center", gap: 14, paddingVertical: 28 }]}>
          <View style={styles.doneIcon}>
            <Ionicons name="checkmark" size={38} color="#fff" />
          </View>
          <Text style={styles.heading}>Video uploaded</Text>
          <Text style={[styles.fileTitle, { textAlign: "center" }]} numberOfLines={2}>
            {submitted.title}
          </Text>
          <View style={styles.pendingPill}>
            <Ionicons name="time-outline" size={16} color={Theme.warn} />
            <Text style={styles.pendingText}>Waiting for admin approval</Text>
          </View>
          <Text style={[styles.sub, { textAlign: "center" }]}>
            It stays private until an admin approves it. You'll get a notification when it is approved or rejected.
          </Text>
          <GradientButton
            label="View my videos"
            icon="albums-outline"
            onPress={() => {
              hapticLight();
              router.push("/(tabs)/profile");
            }}
            style={{ alignSelf: "stretch" }}
          />
          <Pressable
            onPress={() => {
              hapticLight();
              setSubmitted(null);
            }}
          >
            <Text style={styles.linkText}>Upload another video</Text>
          </Pressable>
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <View style={styles.headerBlock}>
        <Text style={styles.heading}>Create a video</Text>
        <Text style={styles.sub}>Up to 90s · uploads immediately in the background while you add details.</Text>
      </View>

      {!videoUri ? (
        <View style={styles.pickerGrid}>
          <Pressable style={({ pressed }) => [styles.pickCard, pressed && { opacity: 0.86 }]} onPress={pickVideoFromLibrary}>
            <LinearGradient colors={["rgba(110,86,255,0.28)", "rgba(110,86,255,0.08)"]} style={styles.pickIcon}>
              <Ionicons name="folder-open" size={26} color={Theme.brand} />
            </LinearGradient>
            <Text style={styles.pickTitle}>Choose Video</Text>
            <Text style={styles.pickHint}>MP4 / WebM up to 90s</Text>
          </Pressable>
          <Pressable style={({ pressed }) => [styles.pickCard, pressed && { opacity: 0.86 }]} onPress={recordVideoWithCamera}>
            <LinearGradient colors={["rgba(34,211,238,0.28)", "rgba(34,211,238,0.08)"]} style={styles.pickIcon}>
              <Ionicons name="videocam" size={26} color={Theme.accent} />
            </LinearGradient>
            <Text style={styles.pickTitle}>Record Camera</Text>
            <Text style={styles.pickHint}>Up to 90s vertical clip</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.card}>
          <View style={styles.previewWrap}>
            <VideoView player={previewPlayer} style={styles.videoPreview} contentFit="contain" nativeControls />
            {durationSec != null && (
              <View style={styles.durBadge}>
                <Ionicons name="time-outline" size={12} color="#fff" />
                <Text style={styles.durBadgeText}>{formatTime(durationSec)}</Text>
              </View>
            )}
            <Pressable style={styles.removeBadge} onPress={clearSelection}>
              <Ionicons name="close" size={18} color="#fff" />
            </Pressable>
          </View>

          <View style={styles.previewRow}>
            {thumbUri ? (
              <Image source={{ uri: thumbUri }} style={styles.thumb} contentFit="cover" />
            ) : (
              <View style={[styles.thumb, styles.thumbPlaceholder]}>
                <Ionicons name="image-outline" size={22} color={Theme.textMuted} />
              </View>
            )}
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={styles.fileTitle} numberOfLines={1}>{videoName}</Text>
              <Text style={styles.meta}>
                {thumbUri ? "Thumbnail captured" : "No thumbnail yet"}
              </Text>
              <Pressable onPress={pickCustomThumbnail}>
                <Text style={styles.linkText}>Choose custom cover image</Text>
              </Pressable>
            </View>
          </View>

          {bgState === "uploading" && (
            <View style={{ gap: 6 }}>
              <View style={styles.progressHead}>
                <Text style={styles.progressLabel}>
                  {saving ? "Uploading — will submit automatically when done" : "Uploading video..."}
                </Text>
                <Text style={styles.progressPct}>{pct}%</Text>
              </View>
              <View style={styles.progressTrack}>
                <LinearGradient
                  colors={[Theme.brand, Theme.accent]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={[styles.progressFill, { width: `${Math.max(pct, 4)}%` }]}
                />
                <Text style={styles.progressInside}>{pct}%</Text>
              </View>
            </View>
          )}
          {bgState === "ready" && (
            <View style={styles.readyPill}>
              <Ionicons name="checkmark-circle" size={16} color={Theme.success} />
              <Text style={styles.readyText}>{saving ? "Uploaded — submitting..." : "Upload complete — ready to submit"}</Text>
            </View>
          )}
          {bgState === "error" && (
            <Text style={{ color: Theme.danger, fontSize: 12 }}>Upload failed — remove and retry.</Text>
          )}
        </View>
      )}

      <View style={styles.card}>
        <View style={styles.labelRow}>
          <Text style={styles.label}>Title</Text>
          <Text style={styles.charCount}>{title.length}/150</Text>
        </View>
        <TextInput
          style={styles.input}
          maxLength={150}
          placeholder="Give your video a clear title"
          placeholderTextColor={Theme.textMuted}
          value={title}
          onChangeText={setTitle}
          editable={!saving}
        />

        <Text style={styles.label}>Description</Text>
        <TextInput
          style={[styles.input, { minHeight: 84, textAlignVertical: "top" }]}
          multiline
          maxLength={2000}
          placeholder="Share context or story..."
          placeholderTextColor={Theme.textMuted}
          value={description}
          onChangeText={setDescription}
          editable={!saving}
        />

        <Text style={styles.label}>Category</Text>
        <View style={styles.cats}>
          {CATEGORIES.map((c) => (
            <Pressable
              key={c}
              onPress={() => {
                hapticLight();
                setCategory(c);
              }}
              style={[styles.catChip, category === c && styles.catActive]}
            >
              <Text style={[styles.catText, category === c && styles.catTextActive]}>{c}</Text>
            </Pressable>
          ))}
        </View>

        <GradientButton
          label={bgState === "ready" ? "Submit Now (Instant)" : "Upload & Submit"}
          icon={bgState === "ready" ? "flash" : "cloud-upload-outline"}
          onPress={submit}
          loading={saving}
          disabled={!videoUri || bgState === "error"}
          style={{ marginTop: 4 }}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Theme.bg },
  container: { padding: 16, gap: 14 },
  headerBlock: { gap: 4 },
  heading: { color: Theme.text, fontSize: 24, fontWeight: "800", letterSpacing: -0.3 },
  sub: { color: Theme.textMuted, fontSize: 13 },
  pickerGrid: { flexDirection: "row", gap: 12 },
  pickCard: { flex: 1, backgroundColor: Theme.surface, borderRadius: 20, padding: 20, alignItems: "center", gap: 8, borderWidth: 1, borderColor: Theme.borderStrong, borderStyle: "dashed" },
  pickIcon: { width: 54, height: 54, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  pickTitle: { color: Theme.text, fontWeight: "700", fontSize: 14 },
  pickHint: { color: Theme.textMuted, fontSize: 11 },
  card: { backgroundColor: Theme.surface, borderRadius: 18, padding: 14, borderWidth: 1, borderColor: Theme.border, gap: 12 },
  previewWrap: { height: 230, borderRadius: 14, overflow: "hidden", backgroundColor: "#000", position: "relative" },
  videoPreview: { width: "100%", height: "100%" },
  durBadge: { position: "absolute", left: 10, bottom: 10, flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(0,0,0,0.72)", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10 },
  durBadgeText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  removeBadge: { position: "absolute", top: 10, right: 10, width: 32, height: 32, borderRadius: 16, backgroundColor: "rgba(0,0,0,0.7)", alignItems: "center", justifyContent: "center" },
  previewRow: { flexDirection: "row", gap: 12, alignItems: "center" },
  thumb: { width: 56, height: 80, borderRadius: 10, backgroundColor: "#000" },
  thumbPlaceholder: { alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: Theme.border },
  fileTitle: { color: Theme.text, fontWeight: "700", fontSize: 14 },
  meta: { color: Theme.textMuted, fontSize: 12 },
  linkText: { color: Theme.accent, fontSize: 12, fontWeight: "700", marginTop: 2 },
  progressHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  progressLabel: { color: Theme.textSecondary, fontSize: 12, fontWeight: "600", flex: 1 },
  progressPct: { color: Theme.text, fontSize: 13, fontWeight: "800" },
  progressTrack: { height: 26, backgroundColor: Theme.bg, borderRadius: 13, overflow: "hidden", borderWidth: 1, borderColor: Theme.border, justifyContent: "center" },
  progressFill: { position: "absolute", left: 0, top: 0, bottom: 0, borderRadius: 13 },
  progressInside: { color: "#fff", fontSize: 12, fontWeight: "800", textAlign: "center" },
  doneIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: Theme.success, alignItems: "center", justifyContent: "center" },
  pendingPill: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: Theme.warnSoft, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 14 },
  pendingText: { color: Theme.warn, fontSize: 13, fontWeight: "800" },
  readyPill: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: Theme.successSoft, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10 },
  readyText: { color: Theme.success, fontSize: 12, fontWeight: "700" },
  labelRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  label: { color: Theme.textSecondary, fontSize: 12, fontWeight: "600" },
  charCount: { color: Theme.textMuted, fontSize: 11 },
  input: { backgroundColor: Theme.bg, borderWidth: 1, borderColor: Theme.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, color: Theme.text, fontSize: 14 },
  cats: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  catChip: { paddingHorizontal: 11, paddingVertical: 7, borderRadius: 16, backgroundColor: Theme.bg, borderWidth: 1, borderColor: Theme.border },
  catActive: { backgroundColor: Theme.brandSoft, borderColor: Theme.brand },
  catText: { color: Theme.textMuted, fontSize: 12, fontWeight: "600" },
  catTextActive: { color: Theme.text },
});
