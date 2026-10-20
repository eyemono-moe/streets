import type { NostrEvent } from "../nostr/event";
import { type InstalledApplet, sameApplet } from "./library";
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

const latestManifests = (events: readonly NostrEvent[]) => {
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
  return latest;
};

const entryOf = (
  manifest: NappletManifest,
  supported: ReadonlySet<string>,
  followees: ReadonlySet<string>,
): NappletEntry => ({
  manifest,
  unsupported: manifest.requires.filter((domain) => !supported.has(domain)),
  followed: followees.has(manifest.pubkey),
});

/**
 * 届いたマニフェストを、napplet ごとに最新の版だけにして並べる。いまは名前付き（35129）
 * だけを開けるので、それだけを出す。読めないマニフェストと、インストール済みのものは
 * 出さない（インストール済みは別の一覧に並べる）。
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
    installed?: readonly InstalledApplet[];
  },
): NappletEntry[] => {
  const words = options.query.toLowerCase().split(/\s+/).filter(Boolean);
  const installed = options.installed ?? [];
  return [...latestManifests(events).values()]
    .filter(
      (manifest) =>
        !installed.some((item) =>
          sameApplet(item, {
            pubkey: manifest.pubkey,
            identifier: manifest.identifier ?? "",
          }),
        ),
    )
    .filter((manifest) => matches(manifest, words))
    .map((manifest) => entryOf(manifest, options.supported, options.followees))
    .filter(
      (entry) => !options.compatibleOnly || entry.unsupported.length === 0,
    )
    .sort(
      (a, b) =>
        Number(b.followed) - Number(a.followed) ||
        b.manifest.createdAt - a.manifest.createdAt,
    );
};

/**
 * インストール済みのアップレットを、入れた順（新しいものが先）に並べる。マニフェストが
 * まだ届いていないものは `entry` を持たない。
 */
export const installedDirectory = (
  events: readonly NostrEvent[],
  installed: readonly InstalledApplet[],
  options: { supported: ReadonlySet<string>; followees: ReadonlySet<string> },
): { applet: InstalledApplet; entry?: NappletEntry }[] => {
  const latest = latestManifests(events);
  return installed.map((applet) => {
    const manifest = latest.get(`${applet.pubkey}:${applet.identifier}`);
    return manifest
      ? {
          applet,
          entry: entryOf(manifest, options.supported, options.followees),
        }
      : { applet };
  });
};
