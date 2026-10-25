export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const TOKEN_KEY = "fs_token";

export const tokenStore = {
  get: () => (typeof window === "undefined" ? null : localStorage.getItem(TOKEN_KEY)),
  set: (t: string) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) {
    super(message);
  }
}

export async function api<T = unknown>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const token = tokenStore.get();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  let body = init.body;
  if (init.json !== undefined) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(init.json);
  }
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { ...init, headers, body });
  } catch {
    throw new ApiError(0, "network", "Cannot reach the API. Is the backend running on " + API_URL + "?");
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const e = data?.error;
    throw new ApiError(res.status, e?.code ?? "http_error", e?.message ?? `Request failed (${res.status})`, e?.details);
  }
  return data as T;
}

/** Upload with real progress + cancellation (fetch cannot report upload progress, XHR can). */
export function uploadFile(
  kind: "video" | "audio" | "image",
  file: Blob,
  filename: string,
  onProgress: (pct: number) => void,
): { promise: Promise<Asset>; cancel: () => void } {
  const xhr = new XMLHttpRequest();
  const promise = new Promise<Asset>((resolve, reject) => {
    xhr.open("POST", `${API_URL}/uploads`);
    const t = tokenStore.get();
    if (t) xhr.setRequestHeader("Authorization", `Bearer ${t}`);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      let data: any = null;
      try { data = JSON.parse(xhr.responseText); } catch {}
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else reject(new ApiError(xhr.status, data?.error?.code ?? "upload_failed", data?.error?.message ?? `Upload failed (${xhr.status})`));
    };
    xhr.onerror = () => reject(new ApiError(0, "network", "Network error during upload."));
    xhr.onabort = () => reject(new ApiError(0, "aborted", "Upload cancelled."));
    const fd = new FormData();
    fd.append("kind", kind);
    fd.append("file", file, filename);
    xhr.send(fd);
  });
  return { promise, cancel: () => xhr.abort() };
}

/** Absolute media URL. Unapproved media needs the owner's/admin's token because <video> cannot send headers. */
export function mediaSrc(url: string | null | undefined, status?: string): string | undefined {
  if (!url) return undefined;
  const t = tokenStore.get();
  const needsToken = status && status !== "approved";
  return `${API_URL}${url}${needsToken && t ? `?token=${encodeURIComponent(t)}` : ""}`;
}

// ---------- types ----------
export type Role = "viewer" | "creator" | "admin";
export type Status = "pending" | "approved" | "rejected" | "hidden";
export interface User {
  id: number; email: string | null; display_name: string; bio: string; role: Role; is_active: boolean;
  avatar_url: string | null; follower_count: number; following_count: number; video_count: number;
  is_following: boolean; created_at: string;
}
export interface Asset { id: number; kind: string; url: string; mime_type: string; size_bytes: number; original_filename: string }
export interface Video {
  id: number; title: string; description: string; category: string; status: Status; rejection_reason: string | null;
  video_url: string; mime_type: string; owner: User; like_count: number; comment_count: number; liked_by_me: boolean;
  created_at: string; published_at: string | null;
}
export interface Comment { id: number; video_id: number; parent_id: number | null; body: string; author: User; created_at: string; replies: Comment[] }
export interface Podcast { id: number; title: string; description: string; category: string; cover_url: string | null; owner: User; episode_count: number; created_at: string }
export interface Episode {
  id: number; title: string; description: string; status: Status; rejection_reason: string | null; audio_url: string; mime_type: string;
  podcast_id: number; podcast_title: string; category: string; cover_url: string | null; owner: User; created_at: string; published_at: string | null;
}
export interface Notification { id: number; type: string; message: string; link: string | null; is_read: boolean; created_at: string }
export interface Page<T> { items: T[]; total: number; page: number; page_size: number }
export interface ModItem {
  type: "video" | "episode"; id: number; title: string; status: Status; owner: User; media_url: string; mime_type: string;
  category: string; rejection_reason: string | null; created_at: string;
}
export interface ModAction { id: number; admin: User; target_type: string; target_id: number; target_title: string; action: string; reason: string | null; created_at: string }
export interface Report { id: number; target_type: string; target_id: number; target_title: string; reason: string; status: string; reporter: User; created_at: string }
export interface AuditLog { id: number; actor: User | null; action: string; entity_type: string; entity_id: number | null; details: Record<string, unknown> | null; created_at: string }
export interface AdminComment { id: number; video_id: number; video_title: string; body: string; author: User; created_at: string }

export const CATEGORIES = ["Reflection", "Music", "Community", "Wisdom", "Wellness", "Education", "Interfaith", "Story"];
