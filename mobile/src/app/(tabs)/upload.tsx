import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { createVideoPlayer } from "expo-video";
import { useState } from "react";
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

export default function UploadScreen() {
  const [videoUri, setVideoUri] = useState<string | null>(null);
  const [videoName, setVideoName] = useState("video.mp4");
  const [videoMime, setVideoMime] = useState("video/mp4");
  const [durationSec, setDurationSec] = useState<number | null>(null);
  const [thumbUri, setThumbUri] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<string>(CATEGORIES[0]);
  const [pct, setPct] = useState(0);
  const [phase, setPhase] = useState<"idle" | "uploading" | "thumbnail" | "saving">("idle");

  const extractAutoThumbnail = async (uri: string) => {
    let player: ReturnType<typeof createVideoPlayer> | null = null;
    try {
      player = createVideoPlayer(uri);
      const thumbs = await player.generateThumbnailsAsync([0.5], { maxWidth: 480 });
      if (thumbs.length > 0) {
        const rendered = await ImageManipulator.manipulate(thumbs[0]).renderAsync();
        const saved = await rendered.saveAsync({ compress: 0.8, format: SaveFormat.JPEG });
        setThumbUri(saved.uri);
      }
    } catch {
      // Optional on platforms/codecs where native frame extraction fails; user can pick custom thumbnail.
    } finally {
      player?.release();
    }
  };

  const handlePickedVideo = async (asset: ImagePicker.ImagePickerAsset) => {
    const dur = asset.duration ? Math.round(asset.duration / 1000) : null;
    if (dur && dur > 95) {
      Alert.alert("Too long", "Please choose or record a video up to 90 seconds.");
      return;
    }
    const name = asset.fileName || `upload-${Date.now()}.mp4`;
    const mime = asset.mimeType || (name.endsWith(".webm") ? "video/webm" : "video/mp4");
    setVideoUri(asset.uri);
    setVideoName(name);
    setVideoMime(mime);
    setDurationSec(dur);
    setThumbUri(null);
    await extractAutoThumbnail(asset.uri);
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
      quality: 0.8,
    });
    if (!res.canceled && res.assets[0]) {
      await handlePickedVideo(res.assets[0]);
    }
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
      quality: 0.8,
    });
    if (!res.canceled && res.assets[0]) {
      await handlePickedVideo(res.assets[0]);
    }
  };

  const pickCustomThumbnail = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.85,
    });
    if (!res.canceled && res.assets[0]) {
      setThumbUri(res.assets[0].uri);
    }
  };

  const submit = async () => {
    if (!videoUri) {
      Alert.alert("No video", "Pick or record a video first.");
      return;
    }
    if (title.trim().length < 2) {
      Alert.alert("Title required", "Enter a title with at least 2 characters.");
      return;
    }
    try {
      setPhase("uploading");
      setPct(0);
      const vidAsset = await uploadMediaFile("video", videoUri, videoName, videoMime, setPct).promise;

      let thumbAssetId: number | null = null;
      if (thumbUri) {
        setPhase("thumbnail");
        const isPng = thumbUri.toLowerCase().endsWith(".png");
        const thumbAsset = await uploadMediaFile(
          "image",
          thumbUri,
          isPng ? "thumbnail.png" : "thumbnail.jpg",
          isPng ? "image/png" : "image/jpeg",
        ).promise;
        thumbAssetId = thumbAsset.id;
      }

      setPhase("saving");
      await api<Video>("/videos", {
        method: "POST",
        json: {
          asset_id: vidAsset.id,
          thumbnail_asset_id: thumbAssetId,
          duration_seconds: durationSec,
          title: title.trim(),
          description: description.trim(),
          category,
        },
      });

      setPhase("idle");
      setVideoUri(null);
      setThumbUri(null);
      setDurationSec(null);
      setTitle("");
      setDescription("");
      Alert.alert("Submitted!", "Your video and thumbnail were uploaded and are pending admin moderation.");
    } catch (e) {
      setPhase("idle");
      Alert.alert("Upload failed", (e as Error).message);
    }
  };

  const busy = phase !== "idle";

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <Text style={styles.heading}>Upload up to 90s video</Text>
      <Text style={styles.sub}>Select a 90-second video or record with your camera, with auto/custom thumbnail.</Text>

      <View style={styles.row}>
        <Pressable style={styles.pickBtn} onPress={pickVideoFromLibrary} disabled={busy}>
          <Ionicons name="folder-open" size={20} color="#fff" />
          <Text style={styles.pickBtnText}>Gallery (up to 90s)</Text>
        </Pressable>
        <Pressable style={styles.pickBtn} onPress={recordVideoWithCamera} disabled={busy}>
          <Ionicons name="videocam" size={20} color="#fff" />
          <Text style={styles.pickBtnText}>Record (up to 90s)</Text>
        </Pressable>
      </View>

      {videoUri && (
        <View style={styles.card}>
          <View style={styles.previewRow}>
            {thumbUri ? (
              <Image source={{ uri: thumbUri }} style={styles.thumb} contentFit="cover" />
            ) : (
              <View style={[styles.thumb, styles.thumbPlaceholder]}>
                <Ionicons name="film" size={24} color="#8f8da0" />
              </View>
            )}
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={styles.fileTitle} numberOfLines={1}>
                {videoName}
              </Text>
              <Text style={styles.meta}>
                {durationSec != null ? `Duration: ${formatTime(durationSec)}` : "Ready to upload"}
              </Text>
              <Pressable onPress={pickCustomThumbnail} disabled={busy}>
                <Text style={styles.linkText}>Choose custom thumbnail image</Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}

      <View style={styles.card}>
        <Text style={styles.label}>Title</Text>
        <TextInput
          style={styles.input}
          placeholder="Video title"
          placeholderTextColor="#7c7b8a"
          value={title}
          onChangeText={setTitle}
          editable={!busy}
        />

        <Text style={styles.label}>Description</Text>
        <TextInput
          style={[styles.input, { minHeight: 80, textAlignVertical: "top" }]}
          multiline
          placeholder="Describe your video..."
          placeholderTextColor="#7c7b8a"
          value={description}
          onChangeText={setDescription}
          editable={!busy}
        />

        <Text style={styles.label}>Category</Text>
        <View style={styles.cats}>
          {CATEGORIES.map((c) => (
            <Pressable key={c} onPress={() => setCategory(c)} style={[styles.catChip, category === c && styles.catActive]}>
              <Text style={[styles.catText, category === c && styles.catTextActive]}>{c}</Text>
            </Pressable>
          ))}
        </View>

        {phase === "uploading" && (
          <View style={styles.progressWrap}>
            <View style={[styles.progressBar, { width: `${pct}%` }]} />
            <Text style={styles.progressText}>Uploading video... {pct}%</Text>
          </View>
        )}
        {(phase === "thumbnail" || phase === "saving") && (
          <Text style={styles.progressText}>{phase === "thumbnail" ? "Uploading thumbnail..." : "Saving..."}</Text>
        )}

        <Pressable style={styles.submitBtn} onPress={submit} disabled={busy || !videoUri}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>Upload & Submit for Moderation</Text>}
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#0d0c12" },
  container: { padding: 16, gap: 14 },
  heading: { color: "#fff", fontSize: 22, fontWeight: "700" },
  sub: { color: "#9c9aa8", fontSize: 13 },
  row: { flexDirection: "row", gap: 10 },
  pickBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#252336", paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: "#393654" },
  pickBtnText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  card: { backgroundColor: "#171622", borderRadius: 16, padding: 14, borderWidth: 1, borderColor: "#282638", gap: 10 },
  previewRow: { flexDirection: "row", gap: 12, alignItems: "center" },
  thumb: { width: 64, height: 96, borderRadius: 10, backgroundColor: "#000" },
  thumbPlaceholder: { alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#2f2d42" },
  fileTitle: { color: "#fff", fontWeight: "700", fontSize: 14 },
  meta: { color: "#9c9aa8", fontSize: 12 },
  linkText: { color: "#9b84ff", fontSize: 12, fontWeight: "600", marginTop: 4 },
  label: { color: "#c9c8d4", fontSize: 12, fontWeight: "600" },
  input: { backgroundColor: "#0d0c12", borderWidth: 1, borderColor: "#2f2d42", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: "#fff", fontSize: 14 },
  cats: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  catChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, backgroundColor: "#0d0c12", borderWidth: 1, borderColor: "#2f2d42" },
  catActive: { backgroundColor: "#7c5cff33", borderColor: "#7c5cff" },
  catText: { color: "#9c9aa8", fontSize: 12 },
  catTextActive: { color: "#fff", fontWeight: "700" },
  progressWrap: { height: 22, backgroundColor: "#0d0c12", borderRadius: 11, overflow: "hidden", justifyContent: "center" },
  progressBar: { position: "absolute", left: 0, top: 0, bottom: 0, backgroundColor: "#7c5cff" },
  progressText: { color: "#fff", fontSize: 11, fontWeight: "700", textAlign: "center" },
  submitBtn: { backgroundColor: "#7c5cff", paddingVertical: 14, borderRadius: 12, alignItems: "center", marginTop: 4 },
  submitText: { color: "#fff", fontWeight: "700", fontSize: 15 },
});
