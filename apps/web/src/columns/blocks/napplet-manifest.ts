import { nappletManifestSource } from "@streets/core/deck/column-sources";
import {
  type NappletManifest,
  type NappletManifestError,
  parseNappletManifest,
} from "@streets/core/napplet/manifest";
import { type Accessor, createMemo } from "solid-js";
import { createBlockSection } from "../column-scope";

export type NappletManifestLookup =
  | { phase: "loading" }
  | { phase: "missing" }
  | { phase: "invalid"; error: NappletManifestError }
  | { phase: "found"; manifest: NappletManifest };

/** 名前付き napplet（35129）のいちばん新しいマニフェストを引いて読む。 */
export const createNappletManifest = (options: {
  pubkey: Accessor<string>;
  identifier: Accessor<string>;
  relays: Accessor<readonly string[] | undefined>;
}): {
  lookup: Accessor<NappletManifestLookup>;
  /** 読めたマニフェスト。同じ版が別のリレーから届いても、同じものを返す。 */
  manifest: Accessor<NappletManifest | undefined>;
} => {
  const section = createBlockSection({
    source: () =>
      nappletManifestSource(
        options.pubkey(),
        options.identifier(),
        options.relays(),
      ),
    name: "manifest",
    // 開いた napplet そのものは、作者をミュートしていても出す。
    ignoresMutes: true,
  });
  const lookup = createMemo((): NappletManifestLookup => {
    const latest = [...section.items()].sort(
      (a, b) => b.created_at - a.created_at,
    )[0];
    if (!latest) {
      return section.status().phase === "settled"
        ? { phase: "missing" }
        : { phase: "loading" };
    }
    const parsed = parseNappletManifest(latest);
    return parsed.ok
      ? { phase: "found", manifest: parsed.manifest }
      : { phase: "invalid", error: parsed.error };
  });
  const manifest = createMemo(
    () => {
      const current = lookup();
      return current.phase === "found" ? current.manifest : undefined;
    },
    undefined,
    { equals: (a, b) => a?.eventId === b?.eventId },
  );
  return { lookup, manifest };
};
