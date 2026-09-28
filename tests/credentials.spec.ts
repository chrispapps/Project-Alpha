import { expect, test } from "@playwright/test";
import type { ManifestStore } from "@contentauth/c2pa-types";
import { summarizeManifestStore } from "../src/lib/credentials";

const IPTC = "http://cv.iptc.org/newscodes/digitalsourcetype/";

/** A minimal manifest store whose active manifest records the given actions. */
function storeWith(actions: { action: string; digitalSourceType?: string }[]): ManifestStore {
  return {
    active_manifest: "urn:test",
    validation_state: "Valid",
    manifests: {
      "urn:test": {
        title: "photo.jpg",
        signature_info: { issuer: "Example Camera Co" },
        assertions: [{ label: "c2pa.actions.v2", data: { actions } }],
      },
    },
  } as ManifestStore;
}

const ai = (actions: { action: string; digitalSourceType?: string }[]) => summarizeManifestStore(storeWith(actions))!.ai;

test("a camera capture is reported as such", () => {
  expect(ai([{ action: "c2pa.created", digitalSourceType: `${IPTC}digitalCapture` }])).toEqual({
    kind: "capture",
    sourceType: "digitalCapture",
  });
  expect(ai([{ action: "c2pa.created", digitalSourceType: `${IPTC}computationalCapture` }]).kind).toBe("capture");
});

test("any AI declaration outranks a camera capture", () => {
  const result = ai([
    { action: "c2pa.created", digitalSourceType: `${IPTC}digitalCapture` },
    { action: "c2pa.edited", digitalSourceType: `${IPTC}compositeWithTrainedAlgorithmicMedia` },
  ]);
  expect(result.kind).toBe("composite");
});

test("edits alone don't claim a capture", () => {
  expect(ai([{ action: "c2pa.edited", digitalSourceType: `${IPTC}humanEdits` }]).kind).toBe("none-declared");
  expect(ai([{ action: "c2pa.opened" }]).kind).toBe("none-declared");
});
