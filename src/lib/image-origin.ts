// Reads the few metadata fields that hint at where an image without Content
// Credentials came from: screenshot tags, camera details and pixel size. It
// runs on-device and never claims an image is (or isn't) AI-generated; it
// only explains why a missing label may not mean much.

export type OriginSignal =
  /** Screenshot tag in the metadata or a screenshot-style file name. */
  | { kind: "screenshot"; certainty: "marked" | "likely"; reasons: string[] }
  /** Fully parsed and no camera information at all. */
  | { kind: "no-camera-data"; reasons: string[] }
  /** Camera information present: nothing to warn about. */
  | { kind: "camera" }
  /** Format we can't fully read (e.g. HEIC); say nothing rather than guess. */
  | { kind: "unknown" };

interface Metadata {
  format: "jpeg" | "png" | "other";
  width?: number;
  height?: number;
  make?: string;
  model?: string;
  hasExposure: boolean;
  userComment?: string;
  xmp?: string;
}

/** Enough for metadata in JPEG/PNG headers without reading whole large files. */
const READ_BYTES = 1024 * 1024;

// Common phone, tablet and monitor screen resolutions (either orientation).
const SCREEN_SIZES: [number, number][] = [
  // Phones
  [750, 1334], [828, 1792], [1080, 1920], [1080, 2160], [1080, 2220], [1080, 2280], [1080, 2340],
  [1080, 2400], [1080, 2408], [1080, 2412], [1125, 2436], [1170, 2532], [1179, 2556], [1206, 2622],
  [1242, 2208], [1242, 2688], [1284, 2778], [1290, 2796], [1320, 2868], [1440, 2960], [1440, 3040],
  [1440, 3088], [1440, 3120], [1440, 3200], [1344, 2992], [1280, 2856], [1260, 2800],
  // Tablets
  [1620, 2160], [1640, 2360], [1668, 2224], [1668, 2388], [2048, 2732], [1488, 2266], [1600, 2560],
  [1752, 2800],
  // Laptops and monitors
  [1280, 720], [1280, 800], [1366, 768], [1440, 900], [1470, 956], [1512, 982], [1536, 864],
  [1600, 900], [1680, 1050], [1728, 1117], [1920, 1080], [1920, 1200], [2560, 1080], [2560, 1440],
  [2560, 1600], [2736, 1824], [2880, 1800], [2880, 1920], [2940, 1912], [3024, 1964], [3440, 1440],
  [3456, 2234], [3840, 2160], [5120, 2880],
];

const SCREENSHOT_NAME =
  /screen[\s_-]?shot|screen[\s_-]?cap|bildschirmfoto|captura de pantalla|capture d.[ée]cran|schermafbeelding|sk[äa]rmbild|zrzut ekranu/i;

function ascii(bytes: Uint8Array, start: number, end: number): string {
  let out = "";
  for (let i = start; i < end && i < bytes.length; i++) {
    const c = bytes[i];
    if (c === 0) break;
    out += String.fromCharCode(c);
  }
  return out.trim();
}

function indexOf(bytes: Uint8Array, needle: number[], from = 0): number {
  outer: for (let i = from; i <= bytes.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) if (bytes[i + j] !== needle[j]) continue outer;
    return i;
  }
  return -1;
}

const EXIF_HEADER = [0x45, 0x78, 0x69, 0x66, 0, 0]; // "Exif\0\0"

/** Parses a TIFF/EXIF block starting at `start`, filling camera and comment fields. */
function readTiff(bytes: Uint8Array, start: number, meta: Metadata): void {
  if (start + 8 > bytes.length) return;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const little = bytes[start] === 0x49 && bytes[start + 1] === 0x49;
  const big = bytes[start] === 0x4d && bytes[start + 1] === 0x4d;
  if (!little && !big) return;
  const u16 = (o: number) => view.getUint16(start + o, little);
  const u32 = (o: number) => view.getUint32(start + o, little);
  if (u16(2) !== 42) return;

  const visited = new Set<number>();
  const readIfd = (offset: number) => {
    if (visited.has(offset) || start + offset + 2 > bytes.length) return;
    visited.add(offset);
    const count = u16(offset);
    for (let i = 0; i < count; i++) {
      const entry = offset + 2 + i * 12;
      if (start + entry + 12 > bytes.length) return;
      const tag = u16(entry);
      const type = u16(entry + 2);
      const n = u32(entry + 4);
      const size = n * ({ 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 } as Record<number, number>)[type] || 0;
      const valueAt = size <= 4 ? entry + 8 : u32(entry + 8);
      const abs = start + valueAt;
      switch (tag) {
        case 0x010f: // Make
          meta.make = ascii(bytes, abs, abs + n);
          break;
        case 0x0110: // Model
          meta.model = ascii(bytes, abs, abs + n);
          break;
        case 0x829a: // ExposureTime
        case 0x829d: // FNumber
        case 0x8827: // ISO
        case 0x920a: // FocalLength
          meta.hasExposure = true;
          break;
        case 0x9286: // UserComment: 8-byte charset prefix, then text
          meta.userComment = ascii(bytes, abs + 8, abs + n).replace(/\0/g, "");
          break;
        case 0x8769: // Exif sub-IFD
          readIfd(u32(entry + 8));
          break;
      }
    }
  };
  readIfd(u32(4));
}

function readJpeg(bytes: Uint8Array, meta: Metadata): void {
  let i = 2;
  while (i + 4 <= bytes.length && bytes[i] === 0xff) {
    const marker = bytes[i + 1];
    if (marker === 0xd9 || marker === 0xda) break; // end of image / start of scan
    const length = (bytes[i + 2] << 8) | bytes[i + 3];
    const body = i + 4;
    if (marker === 0xe1 && indexOf(bytes.subarray(body, body + 6), EXIF_HEADER) === 0) {
      readTiff(bytes, body + 6, meta);
    }
    // SOF0–SOF15 carry the pixel size (C4, C8, CC are other segments).
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      meta.height = (bytes[body + 1] << 8) | bytes[body + 2];
      meta.width = (bytes[body + 3] << 8) | bytes[body + 4];
    }
    i = body + length - 2;
  }
}

function readPng(bytes: Uint8Array, meta: Metadata): void {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let i = 8;
  while (i + 8 <= bytes.length) {
    const length = view.getUint32(i);
    const type = ascii(bytes, i + 4, i + 8);
    const data = i + 8;
    if (type === "IHDR") {
      meta.width = view.getUint32(data);
      meta.height = view.getUint32(data + 4);
    } else if (type === "eXIf") {
      readTiff(bytes, data, meta);
    } else if (type === "IEND") {
      break;
    }
    i = data + length + 4; // + CRC
  }
}

function readXmp(bytes: Uint8Array): string | undefined {
  const open = indexOf(bytes, [...'<x:xmpmeta'].map((c) => c.charCodeAt(0)));
  if (open < 0) return undefined;
  const close = indexOf(bytes, [...'</x:xmpmeta>'].map((c) => c.charCodeAt(0)), open);
  const end = close < 0 ? Math.min(bytes.length, open + 64 * 1024) : close + 12;
  return new TextDecoder().decode(bytes.subarray(open, end));
}

export function readMetadata(bytes: Uint8Array): Metadata {
  const meta: Metadata = { format: "other", hasExposure: false };
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    meta.format = "jpeg";
    readJpeg(bytes, meta);
  } else if (bytes[0] === 0x89 && ascii(bytes, 1, 4) === "PNG") {
    meta.format = "png";
    readPng(bytes, meta);
  } else {
    // HEIC, WebP, AVIF…: pick up a standard EXIF block if one is easy to find.
    const exif = indexOf(bytes, EXIF_HEADER);
    if (exif >= 0) readTiff(bytes, exif + 6, meta);
  }
  meta.xmp = readXmp(bytes);
  return meta;
}

function screenSize(width?: number, height?: number): string | undefined {
  if (!width || !height) return undefined;
  const hit = SCREEN_SIZES.find(([a, b]) => (a === width && b === height) || (a === height && b === width));
  return hit ? `${width}×${height}` : undefined;
}

export function classifyOrigin(meta: Metadata, fileName: string): OriginSignal {
  const reasons: string[] = [];
  let marked = false;

  const xmpScreenshot = meta.xmp && /UserComment[\s\S]{0,300}?Screenshot/i.test(meta.xmp);
  if (/screenshot/i.test(meta.userComment ?? "") || xmpScreenshot) {
    reasons.push("The image's metadata labels it a screenshot");
    marked = true;
  }
  if (SCREENSHOT_NAME.test(fileName)) {
    reasons.push("The file name looks like a screenshot");
    marked = true;
  }

  const hasCamera = !!(meta.make || meta.model || meta.hasExposure);
  if (hasCamera && !marked) return { kind: "camera" };

  const fullyRead = meta.format === "jpeg" || meta.format === "png";
  const screen = screenSize(meta.width, meta.height);
  if (screen) reasons.push(`Its size, ${screen}, matches a common phone or computer screen`);
  if (!hasCamera && fullyRead) reasons.push("It has no camera information");

  if (marked) return { kind: "screenshot", certainty: "marked", reasons };
  if (!fullyRead) return { kind: "unknown" };
  if (screen) return { kind: "screenshot", certainty: "likely", reasons };
  return { kind: "no-camera-data", reasons };
}

export async function analyzeOrigin(file: File): Promise<OriginSignal> {
  const bytes = new Uint8Array(await file.slice(0, READ_BYTES).arrayBuffer());
  return classifyOrigin(readMetadata(bytes), file.name);
}
