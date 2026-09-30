import { useEffect, useState } from "react";
import { avatar, cn } from "@/lib/utils";
import { slotOf, wsApi } from "@/lib/workspace";
import type { RoomId } from "@/lib/useConsole";

/**
 * Photos live on the server (so every device sees them) and are also kept in this browser,
 * so a server restart never loses them: the next snapshot that shows no photo re-uploads it.
 */
let workspace = "";
let versions: Record<string, number> = {};
const backupKey = (ws: string, id: string) => `vllo-photo-${ws}-${id}`;
const reuploading = new Set<string>();

export function setPhotoVersions(ws: string, v: Record<string, number>) {
  const changed = ws !== workspace || Object.entries(v).some(([k, n]) => versions[k] !== n);
  workspace = ws;
  versions = { ...v };
  for (const [id, n] of Object.entries(v)) {
    if (n) continue;
    const saved = readBackup(ws, id);
    const key = `${ws}/${id}`;
    if (saved && !reuploading.has(key)) {
      reuploading.add(key);
      void putPhoto(ws, id as RoomId, saved).finally(() => setTimeout(() => reuploading.delete(key), 10_000));
    }
  }
  if (changed) window.dispatchEvent(new CustomEvent("vllo-photo"));
}

function readBackup(ws: string, id: string) {
  try {
    return localStorage.getItem(backupKey(ws, id));
  } catch {
    return null;
  }
}

export function photoUrl(id: string) {
  const v = versions[id];
  return v && workspace ? wsApi(workspace, `/photo/${slotOf(id as RoomId)}?v=${v}`) : null;
}

export function usePhoto(id: string) {
  const [src, setSrc] = useState(() => photoUrl(id));
  useEffect(() => {
    const on = () => setSrc(photoUrl(id));
    on();
    window.addEventListener("vllo-photo", on);
    return () => window.removeEventListener("vllo-photo", on);
  }, [id]);
  return src;
}

async function putPhoto(ws: string, id: RoomId, dataUrl: string) {
  const res = await fetch(wsApi(ws, `/photo/${slotOf(id)}`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dataUrl }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error ?? "Upload failed");
}

/** Save a photo for a person: resized, kept in this browser, and sent to the server. */
export async function uploadPhoto(ws: string, id: RoomId, fileOrDataUrl: File | string) {
  const dataUrl = typeof fileOrDataUrl === "string" ? fileOrDataUrl : await fileToDataUrl(fileOrDataUrl);
  try {
    localStorage.setItem(backupKey(ws, id), dataUrl);
  } catch {
    /* storage full or blocked: the server copy still works */
  }
  await putPhoto(ws, id, dataUrl);
}

export async function removePhoto(ws: string, id: RoomId) {
  try {
    localStorage.removeItem(backupKey(ws, id));
  } catch {
    /* ignore */
  }
  await fetch(wsApi(ws, `/photo/${slotOf(id)}`), { method: "DELETE" }).catch(() => {});
}

/** Person of interest: the photo on file, otherwise a neutral illustrated placeholder. */
export function Face({ id, name, className, square }: { id: string; name: string; className?: string; square?: boolean }) {
  const photo = usePhoto(id);
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [photo]);
  return (
    <img
      src={photo && !broken ? photo : avatar(name)}
      onError={() => setBroken(true)}
      alt={name}
      className={cn("border bg-stone-200 object-cover", square ? "rounded-lg" : "rounded-full", className)}
    />
  );
}

/** Centre-crop and downscale so uploads stay small; rejects files that aren't images. */
export function fileToDataUrl(file: File, size = 320): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) return reject(new Error("Please choose an image file."));
    if (file.size > 15_000_000) return reject(new Error("That image is too large (over 15 MB)."));
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const c = document.createElement("canvas");
      const s = Math.min(img.width, img.height);
      c.width = c.height = size;
      c.getContext("2d")!.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL("image/jpeg", 0.86));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("That image couldn't be read. Try a JPG or PNG."));
    };
    img.src = url;
  });
}
