import { fetchVerifiedBlob } from "@streets/core/napplet/artifact";
import type { NappletManifest } from "@streets/core/napplet/manifest";
import { onCleanup } from "solid-js";
import { createStore } from "solid-js/store";

/**
 * napplet のアイコンを、作者のサーバーから取ってハッシュを照合してから blob の URL にする。
 * 初めて聞かれたときに取りに行き、同じアイコンは取り直さない。呼んだ部品が消えたら URL を捨てる。
 *
 * NIP-5D: > Clients MUST render the verified bytes rather than an unverified remote URL.
 * > An absent, malformed, unsupported, unavailable, hash-mismatched, or undecodable icon MUST
 * > fall back to generic artwork
 */
export const createNappletIcons = (): ((
  manifest: NappletManifest,
) => string | undefined) => {
  const [urls, setUrls] = createStore<Record<string, string | null>>({});
  const asked = new Set<string>();
  const controller = new AbortController();
  onCleanup(() => {
    controller.abort();
    for (const url of Object.values(urls)) if (url) URL.revokeObjectURL(url);
  });
  return (manifest) => {
    const icon = manifest.icon;
    if (!icon) return undefined;
    if (!asked.has(icon.hash)) {
      asked.add(icon.hash);
      void fetchVerifiedBlob(
        icon.hash,
        manifest.servers,
        globalThis.fetch.bind(globalThis),
        controller.signal,
      )
        .then((result) => {
          setUrls(
            icon.hash,
            result.ok
              ? URL.createObjectURL(
                  new Blob([result.bytes as BlobPart], { type: icon.mime }),
                )
              : null,
          );
        })
        .catch(() => setUrls(icon.hash, null));
    }
    return urls[icon.hash] ?? undefined;
  };
};
