import type { NostrEvent } from "../nostr/event";
import {
  NAPPLET_NAMED_KIND,
  type NappletManifest,
  parseNappletManifest,
} from "./manifest";

/**
 * napplet を探すときに読むリレー。napplet の作者の多くが使う道具（napplet.run・nostrapps・
 * napplet.soy）が公開に使うリレーを、10 月に kind:35129 を引いて確かめた。
 */
export const NAPPLET_DIRECTORY_RELAYS = [
  "wss://relay.primal.net/",
  "wss://relay.ditto.pub/",
  "wss://nos.lol/",
  "wss://relay.damus.io/",
] as const;

export type NappletEntry = {
  manifest: NappletManifest;
  /** 必須に挙げた機能のうち、Streets が渡せないもの。空なら全部動く見込み。 */
  unsupported: string[];
  /** フォロー中の人が作ったもの。 */
  followed: boolean;
};

const matches = (manifest: NappletManifest, words: readonly string[]) => {
  const text = [
    manifest.title,
    manifest.identifier,
    manifest.description,
    ...manifest.archetypes,
  ]
    .filter(Boolean)
    .join("\n")
    .toLowerCase();
  return words.every((word) => text.includes(word));
};

/**
 * 届いたマニフェストを、napplet ごとに最新の版だけにして並べる。いまは名前付き（35129）
 * だけを開けるので、それだけを出す。読めないマニフェストは出さない。
 *
 * 並びは、フォロー中の人が作ったものを先にし、その中で新しい順。
 */
export const nappletDirectory = (
  events: readonly NostrEvent[],
  options: {
    query: string;
    supported: ReadonlySet<string>;
    /** 必須の機能をすべて Streets が渡せるものだけにする。 */
    compatibleOnly: boolean;
    followees: ReadonlySet<string>;
  },
): NappletEntry[] => {
  const latest = new Map<string, NappletManifest>();
  for (const event of events) {
    if (event.kind !== NAPPLET_NAMED_KIND) continue;
    const parsed = parseNappletManifest(event);
    if (!parsed.ok) continue;
    const key = `${parsed.manifest.pubkey}:${parsed.manifest.identifier ?? ""}`;
    const known = latest.get(key);
    if (!known || known.createdAt < parsed.manifest.createdAt) {
      latest.set(key, parsed.manifest);
    }
  }
  const words = options.query.toLowerCase().split(/\s+/).filter(Boolean);
  return [...latest.values()]
    .filter((manifest) => matches(manifest, words))
    .map((manifest) => ({
      manifest,
      unsupported: manifest.requires.filter(
        (domain) => !options.supported.has(domain),
      ),
      followed: options.followees.has(manifest.pubkey),
    }))
    .filter(
      (entry) => !options.compatibleOnly || entry.unsupported.length === 0,
    )
    .sort(
      (a, b) =>
        Number(b.followed) - Number(a.followed) ||
        b.manifest.createdAt - a.manifest.createdAt,
    );
};
