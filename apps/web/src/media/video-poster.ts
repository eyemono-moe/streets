import { displaySize } from "@streets/core/media/display-size";
import {
  type Accessor,
  createEffect,
  createSignal,
  on,
  onCleanup,
} from "solid-js";

/** 同時に読む動画の数。1 本ごとに原寸の絵をデコードするので、並べすぎない。 */
const MAX_IN_FLIGHT = 2;
/** 最初の絵が届くまで待つ長さ。返事の無いホストで順番を塞がない。 */
const TIMEOUT_MS = 15_000;

let inFlight = 0;
const queue: (() => void)[] = [];

const pump = () => {
  while (inFlight < MAX_IN_FLIGHT) {
    const job = queue.shift();
    if (!job) return;
    job();
  }
};

export type VideoPoster =
  | { state: "loading" }
  | { state: "ready"; canvas: HTMLCanvasElement }
  /** 絵を取れなかった（壊れている・形式が読めない・時間切れ）。 */
  | { state: "failed" };

/**
 * 動画の最初の絵を、長辺 `maxEdge` の canvas に描き写す。描き写したら動画を手放す ——
 * `<video>` を並べたままにすると、1 本ごとに原寸の絵（4K なら 30MB ほど）を持ち続ける。
 * `active` が true になるまで（画面に近づくまで）読みに行かない。
 */
export const createVideoPoster = (
  url: Accessor<string>,
  maxEdge: number,
  active: Accessor<boolean>,
): Accessor<VideoPoster> => {
  const [poster, setPoster] = createSignal<VideoPoster>({ state: "loading" });
  createEffect(
    on([url, active], ([current, ready]) => {
      setPoster({ state: "loading" });
      if (!ready) return;
      let cancelled = false;
      let release: (() => void) | undefined;
      const job = () => {
        if (cancelled) return;
        inFlight++;
        const video = document.createElement("video");
        let timer: ReturnType<typeof setTimeout> | undefined;
        let done = false;
        const finish = (result: VideoPoster) => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          // src を外して読み直すと、デコードした絵と読み込んだぶんを手放す。
          video.removeAttribute("src");
          video.load();
          inFlight--;
          pump();
          if (!cancelled) setPoster(result);
        };
        release = () => finish({ state: "loading" });
        video.muted = true;
        video.playsInline = true;
        video.preload = "auto";
        video.addEventListener("loadeddata", () => {
          const width = video.videoWidth;
          const height = video.videoHeight;
          if (width === 0 || height === 0) {
            finish({ state: "failed" });
            return;
          }
          const size = displaySize({ width, height }, maxEdge) ?? {
            width,
            height,
          };
          const canvas = document.createElement("canvas");
          canvas.width = size.width;
          canvas.height = size.height;
          const context = canvas.getContext("2d");
          if (!context) {
            finish({ state: "failed" });
            return;
          }
          context.drawImage(video, 0, 0, size.width, size.height);
          finish({ state: "ready", canvas });
        });
        video.addEventListener("error", () => finish({ state: "failed" }));
        timer = setTimeout(() => finish({ state: "failed" }), TIMEOUT_MS);
        // 真っ黒なことの多い 0 秒目を避ける。
        video.src = current.includes("#") ? current : `${current}#t=0.1`;
      };
      queue.push(job);
      pump();
      onCleanup(() => {
        cancelled = true;
        const index = queue.indexOf(job);
        if (index !== -1) queue.splice(index, 1);
        release?.();
      });
    }),
  );
  return poster;
};
