import { useEffect, useState } from "react";
import { avatar, cn } from "@/lib/utils";

const key = (id: string) => `vllo-photo-${id}`;

function read(id: string) {
  try {
    return localStorage.getItem(key(id));
  } catch {
    return null;
  }
}

export function setPhoto(id: string, dataUrl: string | null) {
  try {
    if (dataUrl) localStorage.setItem(key(id), dataUrl);
    else localStorage.removeItem(key(id));
  } catch {
    /* storage full or blocked */
  }
  window.dispatchEvent(new CustomEvent("vllo-photo"));
}

export function usePhoto(id: string) {
  const [src, setSrc] = useState(() => read(id));
  useEffect(() => {
    const on = () => setSrc(read(id));
    window.addEventListener("vllo-photo", on);
    window.addEventListener("storage", on);
    return () => {
      window.removeEventListener("vllo-photo", on);
      window.removeEventListener("storage", on);
    };
  }, [id]);
  return src;
}

/** Interviewee face: uploaded photo if the investigator added one, otherwise a neutral illustrated avatar. */
export function Face({ id, name, className }: { id: string; name: string; className?: string }) {
  const photo = usePhoto(id);
  return <img src={photo ?? avatar(name)} alt={name} className={cn("rounded-full border bg-stone-200 object-cover", className)} />;
}

/** Downscale an uploaded image so it fits comfortably in localStorage. */
export function fileToDataUrl(file: File, size = 256): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      const s = Math.min(img.width, img.height);
      c.width = c.height = size;
      c.getContext("2d")!.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
      URL.revokeObjectURL(img.src);
      resolve(c.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}
