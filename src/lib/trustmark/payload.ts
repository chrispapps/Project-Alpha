// Interprets the 100 bits a TrustMark decoder reads from an image: the last
// two bits give the error-correction schema, the rest is payload + ECC.
// Mirrors Adobe's Python DataLayer (trustmark/datalayer.py), which checks
// only the schema the watermark declares; the JavaScript example also tries
// the other schemas, which makes false detections more likely.

import { BCH } from "./bch";

const BCH_POLYNOMIAL = 137;

const SCHEMAS = [
  { name: "BCH_SUPER", dataBits: 40, t: 8 },
  { name: "BCH_5", dataBits: 61, t: 5 },
  { name: "BCH_4", dataBits: 68, t: 4 },
  { name: "BCH_3", dataBits: 75, t: 3 },
] as const;

const decoders = new Map<number, BCH>();
function decoderFor(t: number): BCH {
  let bch = decoders.get(t);
  if (!bch) {
    bch = new BCH(t, BCH_POLYNOMIAL);
    decoders.set(t, bch);
  }
  return bch;
}

function toBytes(bits: boolean[]): number[] {
  const bytes: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) byte = (byte << 1) | (bits[i + j] ? 1 : 0);
    bytes.push(byte);
  }
  return bytes;
}

export interface Payload {
  valid: boolean;
  schema: string;
  /** Corrected payload bits as a 0/1 string, when valid. */
  bits?: string;
  /** Number of bit errors that were corrected. */
  corrected?: number;
  /** Schema version (0–3), used in the C2PA soft-binding value. */
  version: number;
}

export function decodePayload(packet: boolean[]): Payload {
  if (packet.length < 100) return { valid: false, schema: "Invalid", version: -1 };
  const version = (packet[98] ? 2 : 0) + (packet[99] ? 1 : 0);
  const schema = SCHEMAS[version];
  const bch = decoderFor(schema.t);
  const data = toBytes(packet.slice(0, schema.dataBits));
  const ecc = toBytes(packet.slice(schema.dataBits, 96));
  if (ecc.length !== bch.eccBytes) return { valid: false, schema: schema.name, version };

  const corrected = bch.decode(data, ecc);
  if (corrected < 0) return { valid: false, schema: schema.name, version };
  const bits = data
    .map((b) => b.toString(2).padStart(8, "0"))
    .join("")
    .slice(0, schema.dataBits);
  return { valid: true, schema: schema.name, bits, corrected, version };
}
