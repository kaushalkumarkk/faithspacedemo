import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const TOKEN_KEY = "fs_token";
const API_URL_KEY = "fs_api_url";

function inferDefaultApiUrl(): string {
  const envUrl = process.env.EXPO_PUBLIC_API_URL;
  if (envUrl) return envUrl.replace(/\/+$/, "");

  // When running in Expo Go on a physical phone, hostUri is "<LAN_IP>:8081".
  const hostUri = Constants.expoConfig?.hostUri ?? (Constants as unknown as { manifest2?: { extra?: { expoClient?: { hostUri?: string } } } }).manifest2?.extra?.expoClient?.hostUri;
  if (hostUri) {
    const host = hostUri.split(":")[0];
    if (host && host !== "localhost" && host !== "127.0.0.1") {
      return `http://${host}:8001`;
    }
  }
  if (Platform.OS === "android") return "http://10.0.2.2:8001";
  return "http://localhost:8001";
}

let cachedToken: string | null = null;
let cachedApiUrl: string = inferDefaultApiUrl();

export function getApiUrl(): string {
  return cachedApiUrl;
}

export async function initStorage(): Promise<{ token: string | null; apiUrl: string }> {
  cachedApiUrl = inferDefaultApiUrl();
  if (Platform.OS === "web" && typeof localStorage !== "undefined") {
    cachedToken = localStorage.getItem(TOKEN_KEY);
  } else {
    try {
      cachedToken = await SecureStore.getItemAsync(TOKEN_KEY);
    } catch {
      cachedToken = null;
    }
  }
  return { token: cachedToken, apiUrl: cachedApiUrl };
}

export async function setStoredToken(token: string | null): Promise<void> {
  cachedToken = token;
  if (Platform.OS === "web" && typeof localStorage !== "undefined") {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
    return;
  }
  if (token) await SecureStore.setItemAsync(TOKEN_KEY, token);
  else await SecureStore.deleteItemAsync(TOKEN_KEY);
}

export async function setStoredApiUrl(url: string): Promise<string> {
  const clean = url.trim().replace(/\/+$/, "") || inferDefaultApiUrl();
  cachedApiUrl = clean;
  if (Platform.OS === "web" && typeof localStorage !== "undefined") {
    localStorage.setItem(API_URL_KEY, clean);
  } else {
    await SecureStore.setItemAsync(API_URL_KEY, clean);
  }
  return clean;
}

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

export async function api<T = unknown>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (cachedToken) headers.set("Authorization", `Bearer ${cachedToken}`);
  let body = init.body;
  if (init.json !== undefined) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(init.json);
  }
  let res: Response;
  try {
    res = await fetch(`${cachedApiUrl}${path}`, { ...init, headers, body });
  } catch {
    throw new ApiError(0, "network", `Cannot reach API at ${cachedApiUrl}. Check your server URL & Wi-Fi.`);
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const e = data?.error;
    throw new ApiError(res.status, e?.code ?? "http_error", e?.message ?? `Request failed (${res.status})`);
  }
  return data as T;
}

export function uploadMediaFile(
  kind: "video" | "audio" | "image",
  uri: string,
  filename: string,
  mimeType: string,
  onProgress?: (pct: number) => void,
): { promise: Promise<Asset>; cancel: () => void } {
  const xhr = new XMLHttpRequest();
  const promise = new Promise<Asset>((resolve, reject) => {
    xhr.open("POST", `${cachedApiUrl}/uploads`);
    if (cachedToken) xhr.setRequestHeader("Authorization", `Bearer ${cachedToken}`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };
    xhr.onload = () => {
      let data: Asset & { error?: { code?: string; message?: string } } | null = null;
      try {
        data = JSON.parse(xhr.responseText);
      } catch {}
      if (xhr.status >= 200 && xhr.status < 300 && data) {
        resolve(data);
      } else {
        reject(new ApiError(xhr.status, data?.error?.code ?? "upload_failed", data?.error?.message ?? `Upload failed (${xhr.status})`));
      }
    };
    xhr.onerror = () => reject(new ApiError(0, "network", "Network error during upload."));
    xhr.onabort = () => reject(new ApiError(0, "aborted", "Upload cancelled."));

    const fd = new FormData();
    fd.append("kind", kind);
    fd.append("file", { uri, name: filename, type: mimeType } as unknown as Blob);
    xhr.send(fd);
  });
  return { promise, cancel: () => xhr.abort() };
}

export function mediaSrc(url: string | null | undefined, status?: string): string | undefined {
  if (!url) return undefined;
  const needsToken = status && status !== "approved";
  return `${cachedApiUrl}${url}${needsToken && cachedToken ? `?token=${encodeURIComponent(cachedToken)}` : ""}`;
}

export function formatTime(sec: number | null | undefined): string {
  if (sec == null || !isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export type Role = "viewer" | "creator" | "admin";
export type Status = "pending" | "approved" | "rejected" | "hidden";

export interface User {
  id: number;
  email: string | null;
  display_name: string;
  bio: string;
  role: Role;
  is_active: boolean;
  avatar_url: string | null;
  follower_count: number;
  following_count: number;
  video_count: number;
  is_following: boolean;
  is_blocked?: boolean;
  blocked_by_target?: boolean;
  created_at: string;
}

export interface Asset {
  id: number;
  kind: string;
  url: string;
  mime_type: string;
  size_bytes: number;
  original_filename: string;
}

export interface Video {
  id: number;
  title: string;
  description: string;
  category: string;
  status: Status;
  rejection_reason: string | null;
  video_url: string;
  thumbnail_url: string | null;
  duration_seconds: number | null;
  mime_type: string;
  owner: User;
  like_count: number;
  comment_count: number;
  liked_by_me: boolean;
  created_at: string;
  published_at: string | null;
}

export interface Comment {
  id: number;
  video_id: number;
  parent_id: number | null;
  body: string;
  author: User;
  created_at: string;
  replies: Comment[];
}

export interface Message {
  id: number;
  sender_id: number;
  recipient_id: number;
  body: string;
  created_at: string;
  read_at: string | null;
}

export interface Conversation {
  user: User;
  last_message: string;
  last_sender_id: number;
  last_at: string;
  unread_count: number;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

export interface ModItem {
  type: "video" | "episode";
  id: number;
  title: string;
  status: Status;
  owner: User;
  media_url: string;
  thumbnail_url: string | null;
  duration_seconds: number | null;
  mime_type: string;
  category: string;
  rejection_reason: string | null;
  created_at: string;
}

export interface Report {
  id: number;
  target_type: string;
  target_id: number;
  target_title: string;
  target_user_id: number | null;
  reason: string;
  status: string;
  reporter: User;
  created_at: string;
}

export const CATEGORIES = ["Reflection", "Music", "Community", "Wisdom", "Wellness", "Education", "Interfaith", "Story"];
