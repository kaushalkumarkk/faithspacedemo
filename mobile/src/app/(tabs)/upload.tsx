import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { createVideoPlayer, useVideoPlayer, VideoView } from "expo-video";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { api, CATEGORIES, formatTime, uploadMediaFile, type Video } from "@/lib/api";
import { Theme } from "@/lib/theme";

export default function UploadScreen() {
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
        if (videoUpRef.current === rec) setBgState("ready");
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
      // Optional fallback when codec doesn't expose thumbnail frame
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

    // Immediately start background upload so Submit feels instant!
    beginBackgroundVideoUpload(asset.uri, name, mime);
    extractAutoThumbnail(asset.uri);
  };

  const pickVideoFromLibrary = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission required", "Allow photo library access to pick a video.");
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["videos"],
      videoMaxDuration: 90,
      // iOS re-encodes the picked clip to 720p H.264 (a 90 s clip is roughly 10-15 MB instead of 100+ MB), so it uploads much faster.
      // Android has no export preset in expo-image-picker, so the original file is uploaded as is.
      videoExportPreset: ImagePicker.VideoExportPreset.H264_1280x720,
    });
    if (!res.canceled && res.assets[0]) handlePickedVideo(res.assets[0]);
  };

  const recordVideoWithCamera = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission required", "Allow camera access to record up to 90 seconds.");
      return;
    }
    const res = await ImagePicker.launchCameraAsync({
      mediaTypes: ["videos"],
      videoMaxDuration: 90,
      videoQuality: ImagePicker.UIImagePickerControllerQualityType.Medium, // iOS only: smaller recording, faster upload
    });
    if (!res.canceled && res.assets[0]) handlePickedVideo(res.assets[0]);
  };

  const pickCustomThumbnail = async () => {
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

      clearSelection();
      setTitle("");
      setDescription("");
      Alert.alert("Submitted!", "Your video is uploaded and pending admin approval.");
    } catch (e) {
      Alert.alert("Upload failed", (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <View style={styles.headerBlock}>
        <Text style={styles.heading}>Create a reel</Text>
        <Text style={styles.sub}>Up to 90 seconds · uploads in the background while you add details.</Text>
      </View>

      {!videoUri ? (
        <View style={styles.pickerGrid}>
          <Pressable style={styles.pickCard} onPress={pickVideoFromLibrary}>
            <View style={[styles.pickIcon, { backgroundColor: Theme.brandSoft }]}>
              <Ionicons name="folder-open" size={26} color={Theme.brand} />
            </View>
            <Text style={styles.pickTitle}>Choose Video</Text>
            <Text style={styles.pickHint}>MP4 / WebM up to 90s</Text>
          </Pressable>
          <Pressable style={styles.pickCard} onPress={recordVideoWithCamera}>
            <View style={[styles.pickIcon, { backgroundColor: Theme.accentSoft }]}>
              <Ionicons name="videocam" size={26} color={Theme.accent} />
            </View>
            <Text style={styles.pickTitle}>Record Camera</Text>
            <Text style={styles.pickHint}>Up to 90s vertical clip</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.card}>
          <View style={styles.previewWrap}>
            <VideoView player={previewPlayer} style={styles.videoPreview} contentFit="contain" nativeControls />
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
                {durationSec != null ? `Duration ${formatTime(durationSec)}` : "Video selected"}
              </Text>
              <Pressable onPress={pickCustomThumbnail}>
                <Text style={styles.linkText}>Change thumbnail image</Text>
              </Pressable>
            </View>
          </View>

          {bgState === "uploading" && (
            <View style={styles.progressWrap}>
              <View style={[styles.progressBar, { width: `${pct}%` }]} />
              <Text style={styles.progressText}>Uploading in background... {pct}%</Text>
            </View>
          )}
          {bgState === "ready" && (
            <View style={styles.readyPill}>
              <Ionicons name="checkmark-circle" size={16} color={Theme.success} />
              <Text style={styles.readyText}>Video uploaded & ready for instant submit</Text>
            </View>
          )}
          {bgState === "error" && (
            <Text style={{ color: Theme.danger, fontSize: 12 }}>Upload failed — remove and retry.</Text>
          )}
        </View>
      )}

      <View style={styles.card}>
        <Text style={styles.label}>Title</Text>
        <TextInput
          style={styles.input}
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
          placeholder="Share context or story..."
          placeholderTextColor={Theme.textMuted}
          value={description}
          onChangeText={setDescription}
          editable={!saving}
        />

        <Text style={styles.label}>Category</Text>
        <View style={styles.cats}>
          {CATEGORIES.map((c) => (
            <Pressable key={c} onPress={() => setCategory(c)} style={[styles.catChip, category === c && styles.catActive]}>
              <Text style={[styles.catText, category === c && styles.catTextActive]}>{c}</Text>
            </Pressable>
          ))}
        </View>

        <Pressable
          style={[styles.submitBtn, (!videoUri || saving || bgState === "error") && { opacity: 0.55 }]}
          onPress={submit}
          disabled={!videoUri || saving || bgState === "error"}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.submitText}>
              {bgState === "ready" ? "Submit Now (Instant)" : "Upload & Submit for Moderation"}
            </Text>
          )}
        </Pressable>
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
  pickCard: { flex: 1, backgroundColor: Theme.surface, borderRadius: 18, padding: 18, alignItems: "center", gap: 8, borderWidth: 1, borderColor: Theme.border },
  pickIcon: { width: 52, height: 52, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  pickTitle: { color: Theme.text, fontWeight: "700", fontSize: 14 },
  pickHint: { color: Theme.textMuted, fontSize: 11 },
  card: { backgroundColor: Theme.surface, borderRadius: 18, padding: 14, borderWidth: 1, borderColor: Theme.border, gap: 12 },
  previewWrap: { height: 220, borderRadius: 14, overflow: "hidden", backgroundColor: "#000", position: "relative" },
  videoPreview: { width: "100%", height: "100%" },
  removeBadge: { position: "absolute", top: 10, right: 10, width: 32, height: 32, borderRadius: 16, backgroundColor: "rgba(0,0,0,0.65)", alignItems: "center", justifyContent: "center" },
  previewRow: { flexDirection: "row", gap: 12, alignItems: "center" },
  thumb: { width: 56, height: 80, borderRadius: 10, backgroundColor: "#000" },
  thumbPlaceholder: { alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: Theme.border },
  fileTitle: { color: Theme.text, fontWeight: "700", fontSize: 14 },
  meta: { color: Theme.textMuted, fontSize: 12 },
  linkText: { color: Theme.accent, fontSize: 12, fontWeight: "700", marginTop: 2 },
  progressWrap: { height: 24, backgroundColor: Theme.bg, borderRadius: 12, overflow: "hidden", justifyContent: "center", borderWidth: 1, borderColor: Theme.border },
  progressBar: { position: "absolute", left: 0, top: 0, bottom: 0, backgroundColor: Theme.brand },
  progressText: { color: "#fff", fontSize: 11, fontWeight: "700", textAlign: "center" },
  readyPill: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: Theme.successSoft, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10 },
  readyText: { color: Theme.success, fontSize: 12, fontWeight: "700" },
  label: { color: Theme.textSecondary, fontSize: 12, fontWeight: "600" },
  input: { backgroundColor: Theme.bg, borderWidth: 1, borderColor: Theme.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, color: Theme.text, fontSize: 14 },
  cats: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  catChip: { paddingHorizontal: 11, paddingVertical: 7, borderRadius: 16, backgroundColor: Theme.bg, borderWidth: 1, borderColor: Theme.border },
  catActive: { backgroundColor: Theme.brandSoft, borderColor: Theme.brand },
  catText: { color: Theme.textMuted, fontSize: 12, fontWeight: "600" },
  catTextActive: { color: Theme.text },
  submitBtn: { backgroundColor: Theme.brand, paddingVertical: 14, borderRadius: 12, alignItems: "center", marginTop: 4 },
  submitText: { color: "#fff", fontWeight: "700", fontSize: 15 },
});
