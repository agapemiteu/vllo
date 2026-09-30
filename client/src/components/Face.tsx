import { useEffect, useState } from "react";
import { apiUrl, avatar, cn } from "@/lib/utils";

/** Photo versions come from the server snapshot; 0 means no photo on file. */
let versions: Record<string, number> = {};

export function setPhotoVersions(v: Record<string, number>) {
  if (Object.entries(v).every(([k, n]) => versions[k] === n)) return;
  versions = { ...versions, ...v };
  window.dispatchEvent(new CustomEvent("vllo-photo"));
}

export function photoUrl(id: string) {
  const v = versions[id];
  return v ? apiUrl(`/api/photo/${id}?v=${v}`) : null;
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

export async function uploadPhoto(id: string, file: File) {
  const dataUrl = await fileToDataUrl(file);
  await fetch(apiUrl(`/api/photo/${id}`), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dataUrl }) });
}

export async function removePhoto(id: string) {
  await fetch(apiUrl(`/api/photo/${id}`), { method: "DELETE" });
}

/** Person of interest: the photo on file, otherwise a neutral illustrated placeholder. */
export function Face({ id, name, className, square }: { id: string; name: string; className?: string; square?: boolean }) {
  const photo = usePhoto(id);
  return (
    <img
      src={photo ?? avatar(name)}
      alt={name}
      className={cn("border bg-stone-200 object-cover", square ? "rounded-lg" : "rounded-full", className)}
    />
  );
}

/** Centre-crop and downscale so uploads stay small. */
export function fileToDataUrl(file: File, size = 320): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      const s = Math.min(img.width, img.height);
      c.width = c.height = size;
      c.getContext("2d")!.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
      URL.revokeObjectURL(img.src);
      resolve(c.toDataURL("image/jpeg", 0.86));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}
