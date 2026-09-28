import type { OriginSignal } from "./image-origin";
import type {
  Manifest,
  ManifestAssertion,
  ManifestStore,
  ValidationStatus,
} from "@contentauth/c2pa-types";

export type TrustLevel = "trusted" | "valid" | "invalid";

export type AiUsage =
  | { kind: "generated"; sourceType: string }
  | { kind: "composite"; sourceType: string }
  | { kind: "none-declared" };

export interface ActionSummary {
  action: string;
  label: string;
  when?: string;
  softwareAgent?: string;
  digitalSourceType?: string;
  description?: string;
}

export interface CredentialSummary {
  trust: TrustLevel;
  title?: string;
  authors: string[];
  issuer?: string;
  signer?: string;
  signedAt?: string;
  algorithm?: string;
  claimGenerator?: string;
  actions: ActionSummary[];
  ai: AiUsage;
  ingredients: { title: string; hasCredentials: boolean }[];
  failures: { code: string; explanation?: string }[];
  /** The signing certificate doesn't chain to the trust list. */
  untrustedSigner: boolean;
  /** Whether the C2PA trust list was available when this file was checked. */
  trustListLoaded: boolean;
  manifestCount: number;
}

export type ValidationOutcome =
  | { status: "credentials"; summary: CredentialSummary }
  | { status: "none"; origin?: OriginSignal }
  | { status: "error"; message: string };

const AI_GENERATED = new Set([
  "trainedAlgorithmicMedia",
  "algorithmicMedia",
  "trainedAlgorithmicData",
  "compositeSynthetic",
]);
const AI_COMPOSITE = new Set([
  "compositeWithTrainedAlgorithmicMedia",
  "algorithmicallyEnhanced",
]);

const ACTION_LABELS: Record<string, string> = {
  "c2pa.created": "Created",
  "c2pa.opened": "Opened",
  "c2pa.placed": "Placed an element",
  "c2pa.edited": "Edited",
  "c2pa.edited.metadata": "Edited metadata",
  "c2pa.color_adjustments": "Colour adjustments",
  "c2pa.cropped": "Cropped",
  "c2pa.resized": "Resized",
  "c2pa.filtered": "Filtered",
  "c2pa.drawing": "Drawing",
  "c2pa.orientation": "Changed orientation",
  "c2pa.converted": "Converted format",
  "c2pa.transcoded": "Transcoded",
  "c2pa.published": "Published",
  "c2pa.redacted": "Redacted",
  "c2pa.removed": "Removed an element",
  "c2pa.repackaged": "Repackaged",
  "c2pa.unknown": "Unknown edits",
  "c2pa.watermarked": "Watermarked",
};

/** Last path segment of a digital source type URI, e.g. "trainedAlgorithmicMedia". */
export function sourceTypeName(uri: string): string {
  return uri.split("/").filter(Boolean).pop() ?? uri;
}

export function actionLabel(action: string): string {
  if (ACTION_LABELS[action]) return ACTION_LABELS[action];
  const tail = action.split(".").pop() ?? action;
  return tail.replace(/[_-]+/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function findAssertions(manifest: Manifest, prefix: string): ManifestAssertion[] {
  return (manifest.assertions ?? []).filter(
    (a) => a.label === prefix || a.label.startsWith(`${prefix}.`),
  );
}

function softwareAgentName(value: unknown): string | undefined {
  return asString(value) ?? asString(asRecord(value)?.name);
}

function readActions(manifest: Manifest): ActionSummary[] {
  const actions: ActionSummary[] = [];
  for (const assertion of findAssertions(manifest, "c2pa.actions")) {
    const list = asRecord(assertion.data)?.actions;
    if (!Array.isArray(list)) continue;
    for (const raw of list) {
      const item = asRecord(raw);
      const action = asString(item?.action);
      if (!item || !action) continue;
      actions.push({
        action,
        label: actionLabel(action),
        when: asString(item.when),
        softwareAgent: softwareAgentName(item.softwareAgent),
        digitalSourceType: asString(item.digitalSourceType),
        description: asString(item.description),
      });
    }
  }
  return actions;
}

function readAuthors(manifest: Manifest): string[] {
  const names = new Set<string>();
  for (const assertion of findAssertions(manifest, "stds.schema-org.CreativeWork")) {
    const author = asRecord(assertion.data)?.author;
    const list = Array.isArray(author) ? author : author ? [author] : [];
    for (const entry of list) {
      const name = asString(entry) ?? asString(asRecord(entry)?.name);
      if (name) names.add(name);
    }
  }
  return [...names];
}

function readAiUsage(manifest: Manifest, actions: ActionSummary[]): AiUsage {
  const sourceTypes = [
    ...actions.map((a) => a.digitalSourceType),
    ...(manifest.ingredients ?? []).map((i) => i.digital_source_type ?? undefined),
  ].filter((t): t is string => !!t);

  const generated = sourceTypes.find((t) => AI_GENERATED.has(sourceTypeName(t)));
  if (generated) return { kind: "generated", sourceType: sourceTypeName(generated) };
  const composite = sourceTypes.find((t) => AI_COMPOSITE.has(sourceTypeName(t)));
  if (composite) return { kind: "composite", sourceType: sourceTypeName(composite) };
  return { kind: "none-declared" };
}

function readFailures(store: ManifestStore): ValidationStatus[] {
  const fromResults = store.validation_results?.activeManifest?.failure;
  if (fromResults?.length) return fromResults;
  // Older stores only report problems through validation_status.
  return (store.validation_status ?? []).filter((s) => s.success !== true);
}

const UNTRUSTED = "signingCredential.untrusted";
// Checks about who is trusted, rather than whether the file was altered. They
// are reported alongside the result instead of as validation failures.
const TRUST_CODES = new Set([UNTRUSTED, "timeStamp.untrusted"]);

function readTrust(store: ManifestStore, hardFailures: ValidationStatus[]): TrustLevel {
  if (store.validation_state === "Trusted") return "trusted";
  // Only integrity failures make a file invalid; trust results are reported separately.
  if (store.validation_state === "Invalid") return hardFailures.length ? "invalid" : "valid";
  if (store.validation_state === "Valid") return "valid";
  // No explicit state: fall back to whether any check other than trust failed.
  return hardFailures.length ? "invalid" : "valid";
}

export function summarizeManifestStore(
  store: ManifestStore,
  options: { trustListLoaded?: boolean } = {},
): CredentialSummary | null {
  const label = store.active_manifest;
  const manifests = store.manifests ?? {};
  const manifest = label ? manifests[label] : undefined;
  if (!manifest) return null;

  const actions = readActions(manifest);
  const failures = readFailures(store);
  // An untrusted certificate isn't tampering, so it is reported separately.
  const hardFailures = failures.filter((f) => !TRUST_CODES.has(f.code));
  const generator =
    manifest.claim_generator_info?.[0] ?? undefined;

  return {
    trust: readTrust(store, hardFailures),
    title: asString(manifest.title),
    authors: readAuthors(manifest),
    issuer: asString(manifest.signature_info?.issuer),
    signer: asString(manifest.signature_info?.common_name),
    signedAt: asString(manifest.signature_info?.time),
    algorithm: asString(manifest.signature_info?.alg),
    claimGenerator: generator
      ? [generator.name, generator.version].filter(Boolean).join(" ")
      : asString(manifest.claim_generator),
    actions,
    ai: readAiUsage(manifest, actions),
    ingredients: (manifest.ingredients ?? []).map((i) => ({
      title: asString(i.title) ?? "Untitled ingredient",
      hasCredentials: !!i.active_manifest,
    })),
    failures: hardFailures.map((f) => ({
      code: f.code,
      explanation: asString(f.explanation),
    })),
    untrustedSigner: failures.some((f) => f.code === UNTRUSTED),
    trustListLoaded: options.trustListLoaded ?? false,
    manifestCount: Object.keys(manifests).length,
  };
}
