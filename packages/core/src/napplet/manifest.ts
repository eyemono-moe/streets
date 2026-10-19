/*
 * NIP-5D（Nostr Web Applets、PR #2303、2026-10-17 版）の napplet マニフェスト。
 *
 * > A napplet is published as a **napplet manifest** event under NIP-5D's own kinds:
 * > `5129` snapshot (regular) / `15129` root napplet (replaceable) / `35129` named napplet (addressable)
 * > A napplet is a single self-contained `/index.html`. The manifest MUST carry exactly one `x` tag
 * > holding the lowercase-hex sha256 of that artifact — `["x", "<sha256>"]` — and `server` tags
 * > SHOULD hint the Blossom servers holding the blob.
 * > The event `content` MUST contain a non-empty, human-readable plain-text description of the napplet.
 * > Each tag names one bare NAP domain (e.g. `relay`, never `NAP-RELAY`).
 */
import type { NostrEvent } from "../nostr/event";

export const NAPPLET_SNAPSHOT_KIND = 5129;
export const NAPPLET_ROOT_KIND = 15129;
export const NAPPLET_NAMED_KIND = 35129;

export type NappletManifest = {
  eventId: string;
  kind: number;
  pubkey: string;
  /** 名前付き（35129）だけが持つ。 */
  identifier?: string;
  /** `index.html` の sha256。napplet の身元は、この中身で決まる。 */
  artifactHash: string;
  description: string;
  title?: string;
  servers: string[];
  /** 無いと全部は動かないと napplet が申告している機能。権限ではない。 */
  requires: string[];
  optional: string[];
  source?: string;
};

export type NappletManifestError =
  | "not-napplet"
  /** 2026-10 より前の形（`path` タグ・まとめたハッシュ）。いまの NIP-5D では開けない。 */
  | "legacy-format"
  | "missing-hash"
  | "multiple-hashes"
  | "invalid-hash"
  | "missing-description"
  | "missing-identifier";

const HEX_64 = /^[0-9a-f]{64}$/;
const NAPPLET_KINDS: readonly number[] = [
  NAPPLET_SNAPSHOT_KIND,
  NAPPLET_ROOT_KIND,
  NAPPLET_NAMED_KIND,
];

const values = (event: NostrEvent, name: string): string[] =>
  event.tags.flatMap((tag) =>
    tag[0] === name && typeof tag[1] === "string" ? [tag[1]] : [],
  );

const httpsOrigin = (raw: string): string | undefined => {
  try {
    const url = new URL(raw);
    return url.protocol === "https:" ? url.origin : undefined;
  } catch {
    return undefined;
  }
};

export const parseNappletManifest = (
  event: NostrEvent,
):
  | { ok: true; manifest: NappletManifest }
  | { ok: false; error: NappletManifestError } => {
  if (!NAPPLET_KINDS.includes(event.kind))
    return { ok: false, error: "not-napplet" };
  // > Manifests in the old shape (`path` tags) don't load.（nostrapps の NAPPLET.md）
  // 古い形は `x` に「まとめたハッシュ」を書くので、そのまま本体として照合すると必ず食い違う。
  if (
    event.tags.some(
      (tag) => tag[0] === "path" || (tag[0] === "x" && tag[2] === "aggregate"),
    )
  ) {
    return { ok: false, error: "legacy-format" };
  }
  const hashes = values(event, "x");
  if (hashes.length === 0) return { ok: false, error: "missing-hash" };
  if (hashes.length > 1) return { ok: false, error: "multiple-hashes" };
  const artifactHash = hashes[0] as string;
  if (!HEX_64.test(artifactHash)) return { ok: false, error: "invalid-hash" };
  const description = event.content.trim();
  if (description === "") return { ok: false, error: "missing-description" };
  const identifier = values(event, "d")[0];
  if (event.kind === NAPPLET_NAMED_KIND && identifier === undefined) {
    return { ok: false, error: "missing-identifier" };
  }
  const domains = (name: string) => [
    ...new Set(
      values(event, name)
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ];
  return {
    ok: true,
    manifest: {
      eventId: event.id,
      kind: event.kind,
      pubkey: event.pubkey,
      ...(event.kind === NAPPLET_NAMED_KIND ? { identifier } : {}),
      artifactHash,
      description,
      title: values(event, "title")[0],
      // Blossom のサーバーは origin で指す。`http:` は混在コンテンツで読めず、
      // パスの付いた値は blob の URL を組み立て損なうので origin に揃える。
      servers: [
        ...new Set(
          values(event, "server").flatMap((raw) => httpsOrigin(raw) ?? []),
        ),
      ],
      requires: domains("R"),
      optional: domains("O"),
      source: values(event, "source")[0],
    },
  };
};

/**
 * napplet の保存先を分ける鍵（NAP-STORAGE の Identity Scope）。
 *
 * > For a named manifest, the manifest key is its publisher, kind, and `d` value; for a root
 * > manifest, publisher and kind; for a snapshot, its signed event id. The scope also includes
 * > `artifactHash`. A bare `d` value MUST NOT identify a scope.
 */
export const nappletScope = (manifest: NappletManifest): string => {
  const key =
    manifest.kind === NAPPLET_SNAPSHOT_KIND
      ? manifest.eventId
      : `${manifest.kind}:${manifest.pubkey}:${manifest.identifier ?? ""}`;
  return `${key}:${manifest.artifactHash}`;
};
