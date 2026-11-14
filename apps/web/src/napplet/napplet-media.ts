import { fetchVerifiedBlob } from "@streets/core/napplet/artifact";
import type { NappletManifest } from "@streets/core/napplet/manifest";
import {
  NAPPLET_SCREENSHOT_LIMIT,
  type NappletMedia,
  acceptPresentationBytes,
} from "@streets/core/napplet/media";
import { createSignal, onCleanup } from "solid-js";
import { createStore } from "solid-js/store";

/** 取得中は `url` が無い。取れなかったものは並べない。 */
export type NappletScreenshot = NappletMedia & { url?: string };

export type NappletPreview = NappletMedia & {
  state: "idle" | "loading" | "failed" | "ready";
  url?: string;
};

/**
 * napplet の画面の見本を、作者のサーバーから取ってハッシュと形を確かめてから blob の URL にする。
 * スクリーンショットは聞かれたときに取り、プレビュー動画は押されるまで取らない（数 MB ある）。
 */
export const createNappletMedia = (
  manifest: () => NappletManifest | undefined,
) => {
  const [screenshotUrls, setScreenshotUrls] = createStore<
    Record<string, string | null>
  >({});
  const [preview, setPreview] = createSignal<{
    hash: string;
    state: NappletPreview["state"];
    url?: string;
  }>();
  const asked = new Set<string>();
  const urls: string[] = [];
  const controller = new AbortController();
  onCleanup(() => {
    controller.abort();
    for (const url of urls) URL.revokeObjectURL(url);
  });

  const load = async (
    role: "screenshot" | "preview",
    media: NappletMedia,
    servers: readonly string[],
  ): Promise<string | undefined> => {
    const result = await fetchVerifiedBlob(
      media.hash,
      servers,
      globalThis.fetch.bind(globalThis),
      controller.signal,
    );
    if (!result.ok) return undefined;
    const format = acceptPresentationBytes(role, media, result.bytes);
    if (!format) return undefined;
    const blob = new Blob([result.bytes as BlobPart], { type: format });
    // 先頭のバイトが合っていても、壊れていて描けないものは並べない。
    if (role === "screenshot") {
      const bitmap = await createImageBitmap(blob).catch(() => undefined);
      if (!bitmap) return undefined;
      bitmap.close();
    }
    const url = URL.createObjectURL(blob);
    urls.push(url);
    return url;
  };

  const screenshots = (): NappletScreenshot[] => {
    const current = manifest();
    if (!current) return [];
    return current.screenshots
      .slice(0, NAPPLET_SCREENSHOT_LIMIT)
      .flatMap((media) => {
        if (!asked.has(media.hash)) {
          asked.add(media.hash);
          void load("screenshot", media, current.servers)
            .catch(() => undefined)
            .then((url) => setScreenshotUrls(media.hash, url ?? null));
        }
        const url = screenshotUrls[media.hash];
        if (url === null) return [];
        return [{ ...media, ...(url ? { url } : {}) }];
      });
  };

  const previewOf = (): NappletPreview | undefined => {
    const media = manifest()?.preview;
    if (!media) return undefined;
    const loaded = preview();
    return loaded?.hash === media.hash
      ? {
          ...media,
          state: loaded.state,
          ...(loaded.url ? { url: loaded.url } : {}),
        }
      : { ...media, state: "idle" };
  };

  const playPreview = () => {
    const current = manifest();
    const media = current?.preview;
    if (!current || !media) return;
    const state = preview();
    if (state?.hash === media.hash && state.state !== "failed") return;
    setPreview({ hash: media.hash, state: "loading" });
    void load("preview", media, current.servers)
      .catch(() => undefined)
      .then((url) =>
        setPreview(
          url
            ? { hash: media.hash, state: "ready", url }
            : { hash: media.hash, state: "failed" },
        ),
      );
  };

  /** ブラウザが再生できない動画だった。 */
  const previewFailed = () => {
    const state = preview();
    if (state) setPreview({ hash: state.hash, state: "failed" });
  };

  return { screenshots, preview: previewOf, playPreview, previewFailed };
};
