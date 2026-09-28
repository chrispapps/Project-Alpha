import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Content Credentials Validator",
    short_name: "Credentials",
    description:
      "Check an image for C2PA Content Credentials: who signed it, what was done to it, and whether AI was declared. Works offline; images never leave your device.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#0a0c10",
    theme_color: "#0a0c10",
    categories: ["utilities", "photo", "security"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    // Lets the installed app appear in the system share sheet (Android, ChromeOS).
    // The service worker receives the POST; see public/sw.js.
    share_target: {
      action: "/share-target",
      method: "POST",
      enctype: "multipart/form-data",
      params: {
        files: [
          {
            name: "image",
            accept: ["image/*", ".jpg", ".jpeg", ".png", ".webp", ".avif", ".heic", ".heif", ".tif", ".tiff", ".dng"],
          },
        ],
      },
    },
  };
}
