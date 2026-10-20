import type { NappletManifestError } from "@streets/core/napplet/manifest";
import { type Component, type JSX, Match, Show, Switch } from "solid-js";

export type NappletPhase =
  | { phase: "manifest-loading" }
  | { phase: "manifest-missing" }
  | { phase: "manifest-invalid"; error: NappletManifestError }
  | { phase: "artifact-loading" }
  | {
      phase: "artifact-failed";
      error: "unavailable" | "hash-mismatch" | "no-server";
    }
  | { phase: "ready" };

export const MANIFEST_ERRORS: Record<NappletManifestError, string> = {
  "not-napplet": "napplet ではないイベントです。",
  "legacy-multi-file":
    "この napplet は古い形式で、複数のファイルに分かれているため開けません。",
  "missing-hash": "napplet の本体を指す情報（x タグ）がありません。",
  "multiple-hashes":
    "napplet の本体を指す情報（x タグ）が複数あり、どれを動かすか決められません。",
  "invalid-hash": "napplet の本体を指す情報（x タグ）の形が正しくありません。",
  "missing-description": "napplet の説明がありません。",
  "missing-identifier": "napplet の名前（d タグ）がありません。",
};

const ARTIFACT_ERRORS: Record<
  "unavailable" | "hash-mismatch" | "no-server",
  string
> = {
  unavailable:
    "napplet の本体を取得できませんでした。置き場所のサーバーが止まっているかもしれません。",
  "hash-mismatch":
    "取得した napplet の本体が、作者が公開したものと一致しません。安全のため動かしません。",
  "no-server":
    "napplet の本体の置き場所（server タグ）が書かれていないため、取得できません。",
};

const Notice: Component<{ children: JSX.Element; tone?: "warn" }> = (props) => (
  <p
    class="p-4 text-caption"
    classList={{
      "c-secondary": props.tone === undefined,
      "c-status-warn": props.tone === "warn",
    }}
  >
    {props.children}
  </p>
);

/**
 * napplet のカラムの中身。読み込みの段階ごとの案内と、動いている napplet を出す。
 * `frame` は読み込めたときだけ渡す。
 */
const NappletView: Component<{
  state: NappletPhase;
  /** napplet が必須と申告したのに、Streets が渡せない機能。 */
  unsupported?: readonly string[];
  frame?: JSX.Element;
}> = (props) => (
  <div class="flex h-full min-h-0 flex-col">
    <Switch>
      <Match when={props.state.phase === "manifest-loading"}>
        <Notice>napplet の情報を取得中…</Notice>
      </Match>
      <Match when={props.state.phase === "manifest-missing"}>
        <Notice>napplet が見つかりませんでした。</Notice>
      </Match>
      <Match
        when={
          props.state.phase === "manifest-invalid" ? props.state : undefined
        }
      >
        {(state) => (
          <Notice tone="warn">{MANIFEST_ERRORS[state().error]}</Notice>
        )}
      </Match>
      <Match when={props.state.phase === "artifact-loading"}>
        <Notice>napplet を取得中…</Notice>
      </Match>
      <Match
        when={props.state.phase === "artifact-failed" ? props.state : undefined}
      >
        {(state) => (
          <Notice tone="warn">{ARTIFACT_ERRORS[state().error]}</Notice>
        )}
      </Match>
      <Match when={props.state.phase === "ready"}>
        <Show when={(props.unsupported?.length ?? 0) > 0}>
          <p class="c-status-warn flex shrink-0 items-start gap-1 px-4 py-2 text-caption">
            <span
              class="i-material-symbols:warning-outline-rounded mt-0.5 size-3.5 shrink-0"
              aria-hidden="true"
            />
            <span>
              Streets がまだ対応していない機能（{props.unsupported?.join("・")}
              ）を使うため、一部が動かないかもしれません。
            </span>
          </p>
        </Show>
        <div class="min-h-0 flex-1">{props.frame}</div>
      </Match>
    </Switch>
  </div>
);

export default NappletView;
