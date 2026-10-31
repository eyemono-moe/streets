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
  /** 秒。版の新しさを見せるのに使う。 */
  createdAt: number;
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
  /** 何をする napplet か（`z` タグ。`feed`・`profile` など）。自己申告。 */
  archetypes: string[];
  /**
   * 受け付ける依頼（NAP-INTENT の `i` タグ）。`params` は napplet が挙げた引数の名前で、
   * 型や必須かどうかは表さない。
   */
  intents: { convention: string; params: string[] }[];
  icon?: { hash: string; mime: string };
  source?: string;
  /**
   * 2026-10 より前の形で公開されたもの。本体のハッシュは `path` タグから取り、
   * `requires` は必須と任意を分けていないので、すべて必須として扱う。
   */
  legacy: boolean;
};

export type NappletManifestError =
  | "not-napplet"
  /** 古い形で、`index.html` 以外のファイルも持つもの。1 枚の srcdoc では動かせない。 */
  | "legacy-multi-file"
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
const ICON_TYPES: readonly string[] = ["image/png", "image/jpeg", "image/webp"];

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

const unique = (items: readonly string[]) => [
  ...new Set(items.map((item) => item.trim()).filter(Boolean)),
];

/**
 * 2026-10-04 より前の形（NIP-5A に倣った `path` タグ・まとめたハッシュ・`description` タグ）。
 * 対応は napplet/migrate の docs/migration.md の表に従う:
 *
 * > | `description` tag | Required nonempty plain-text event `content` |
 * > | `path /index.html <hash>` | Exactly one `x <artifact-hash>` tag |
 * > | `x <aggregate-hash> aggregate` | Removed; never reused as the artifact hash |
 * > | `requires <domain>` | Your choice of `R <domain>` or `O <domain>` |
 * > multi-file manifests block migration.
 */
const isLegacy = (event: NostrEvent): boolean =>
  event.tags.some(
    (tag) => tag[0] === "path" || (tag[0] === "x" && tag[2] === "aggregate"),
  );

const legacyArtifact = (
  event: NostrEvent,
): { hash: string } | { error: NappletManifestError } => {
  const paths = event.tags.filter((tag) => tag[0] === "path");
  const index = paths.filter((tag) => tag[1] === "/index.html");
  if (paths.length > index.length) return { error: "legacy-multi-file" };
  if (index.length === 0) return { error: "missing-hash" };
  if (index.length > 1) return { error: "multiple-hashes" };
  return { hash: index[0]?.[2] ?? "" };
};

export const parseNappletManifest = (
  event: NostrEvent,
):
  | { ok: true; manifest: NappletManifest }
  | { ok: false; error: NappletManifestError } => {
  if (!NAPPLET_KINDS.includes(event.kind))
    return { ok: false, error: "not-napplet" };
  const legacy = isLegacy(event);
  let artifactHash: string;
  if (legacy) {
    const artifact = legacyArtifact(event);
    if ("error" in artifact) return { ok: false, error: artifact.error };
    artifactHash = artifact.hash;
  } else {
    const hashes = values(event, "x");
    if (hashes.length === 0) return { ok: false, error: "missing-hash" };
    if (hashes.length > 1) return { ok: false, error: "multiple-hashes" };
    artifactHash = hashes[0] as string;
  }
  if (!HEX_64.test(artifactHash)) return { ok: false, error: "invalid-hash" };
  const description = (
    event.content.trim() ||
    (legacy ? (values(event, "description")[0] ?? "") : "")
  ).trim();
  if (description === "") return { ok: false, error: "missing-description" };
  const identifier = values(event, "d")[0];
  if (event.kind === NAPPLET_NAMED_KIND && identifier === undefined) {
    return { ok: false, error: "missing-identifier" };
  }
  const iconTag = event.tags.find((tag) => tag[0] === "icon");
  const icon =
    iconTag &&
    HEX_64.test(iconTag[1] ?? "") &&
    ICON_TYPES.includes(iconTag[2] ?? "")
      ? { hash: iconTag[1] as string, mime: iconTag[2] as string }
      : undefined;
  return {
    ok: true,
    manifest: {
      eventId: event.id,
      kind: event.kind,
      pubkey: event.pubkey,
      createdAt: event.created_at,
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
      requires: unique(legacy ? values(event, "requires") : values(event, "R")),
      optional: legacy ? [] : unique(values(event, "O")),
      archetypes: unique(values(event, "z")),
      intents: intentsOf(event),
      ...(icon ? { icon } : {}),
      source: values(event, "source")[0],
      legacy,
    },
  };
};

/** NAP-INTENT の慣習の名前（`napplet:<archetype>/<action>`）。問い合わせと断片は持たない。 */
export const INTENT_CONVENTION = /^napplet:([^/?#]+)\/([^/?#]+)$/;

// NAP-INTENT: > For each valid `i` tag, the runtime MUST expose an `IntentContract` whose
// > `convention` is the tag's second element and whose `params` are the remaining elements
const intentsOf = (event: NostrEvent) => {
  const seen = new Set<string>();
  return event.tags.flatMap((tag) => {
    const [name, convention, ...params] = tag;
    if (name !== "i" || !convention || !INTENT_CONVENTION.test(convention)) {
      return [];
    }
    if (seen.has(convention)) return [];
    seen.add(convention);
    return [{ convention, params }];
  });
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
