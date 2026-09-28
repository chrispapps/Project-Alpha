// Media formats the C2PA SDK can read, shared by the browser and the link fetcher.

export type MediaKind = "image" | "video" | "audio";

export const EXTENSION_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  avif: "image/avif",
  heic: "image/heic",
  heif: "image/heif",
  gif: "image/gif",
  tif: "image/tiff",
  tiff: "image/tiff",
  svg: "image/svg+xml",
  dng: "image/x-adobe-dng",
  jxl: "image/jxl",
  mp4: "video/mp4",
  m4v: "video/x-m4v",
  mov: "video/quicktime",
  avi: "video/x-msvideo",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  m4a: "audio/mp4",
  flac: "audio/flac",
};

/** What the file picker offers. */
export const ACCEPT = [
  "image/*",
  "video/mp4",
  "video/quicktime",
  "video/x-m4v",
  "video/x-msvideo",
  "audio/*",
  ...Object.keys(EXTENSION_TYPES).map((ext) => `.${ext}`),
].join(",");

export function extensionType(name: string): string | undefined {
  const ext = name.split(/[?#]/)[0].split(".").pop()?.toLowerCase();
  return ext ? EXTENSION_TYPES[ext] : undefined;
}

export function mediaKind(type: string | undefined): MediaKind {
  if (type?.startsWith("video/")) return "video";
  if (type?.startsWith("audio/")) return "audio";
  return "image";
}

export const NOUN: Record<MediaKind, string> = { image: "image", video: "video", audio: "audio file" };
