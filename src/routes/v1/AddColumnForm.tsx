import { For, Show, createSignal } from "solid-js";
import type { Component } from "solid-js";
import type { ColumnDef } from "../../core/deck/deck";
import Button from "../../shared/components/UI/Button";
import { type ColumnPresetKind, buildColumn } from "./column-presets";

const KIND_LABELS: Record<ColumnPresetKind, string> = {
  home: "ホーム",
  notifications: "通知",
  user: "ユーザー",
  hashtag: "ハッシュタグ",
  global: "グローバル",
};

/**
 * 種別ごとに入力欄が要るかどうか。`home`/`global`/`notifications` は
 * `buildColumn` が成功するので、出しても押せない空欄になり迷わせる。
 */
const NEEDS_INPUT: Record<ColumnPresetKind, boolean> = {
  home: false,
  notifications: false,
  user: true,
  hashtag: true,
  global: false,
};

const KINDS: ColumnPresetKind[] = [
  "home",
  "notifications",
  "user",
  "hashtag",
  "global",
];

/**
 * ヘッダの「+」でカラムを追加するフォーム。`buildColumn` (純関数) と
 * 分けるのは、UI の状態と「正しい `ColumnSource` を作るか」のロジックを混ぜないため。
 */
const AddColumnForm: Component<{
  onAdd: (column: ColumnDef) => void;
}> = (props) => {
  const [open, setOpen] = createSignal(false);
  const [kind, setKind] = createSignal<ColumnPresetKind>("home");
  const [input, setInput] = createSignal("");
  const [error, setError] = createSignal<string>();

  const close = () => {
    setOpen(false);
    setKind("home");
    setInput("");
    setError(undefined);
  };

  const submit = (event: Event) => {
    event.preventDefault();
    // `buildColumn` は不正入力を undefined で返す契約だが、
    // `crypto.randomUUID()` は入力に関係なく投げうる (非セキュアコンテキスト
    // では TypeError)。ここで catch しないと例外が外へ抜け、押しても
    // 何も起きないように見えるので、投げうるものは何であれ同じ経路で見せる。
    let column: ReturnType<typeof buildColumn>;
    try {
      column = buildColumn(kind(), input());
    } catch (error) {
      setError(
        `カラムを作成できませんでした: ${error instanceof Error ? error.message : String(error)}`,
      );
      return;
    }
    if (!column) {
      // フォームを閉じない —— buildColumn が undefined を返すのは「誰にも
      // マッチしないカラムを黙って作らない」契約であり、ここで閉じてしまう
      // とその契約の意味が無くなる (何が悪かったのか分からないまま消える)。
      setError(
        "入力を確認してください。user は npub または hex、hashtag は空でない文字列が必要です。",
      );
      return;
    }
    props.onAdd(column);
    close();
  };

  return (
    <div class="shrink-0 border-alpha-300 border-b p-3">
      <Show
        when={open()}
        fallback={
          <Button data-testid="add-column" onClick={() => setOpen(true)}>
            + カラムを追加
          </Button>
        }
      >
        <form
          data-testid="add-column-form"
          class="flex flex-wrap items-center gap-2"
          onSubmit={submit}
        >
          <div class="flex flex-wrap gap-1">
            <For each={KINDS}>
              {(k) => (
                <button
                  type="button"
                  data-testid={`add-column-kind-${k}`}
                  class="rounded-full border border-alpha-300 px-3 py-1 text-xs"
                  classList={{ "bg-accent-primary text-white": kind() === k }}
                  onClick={() => {
                    setKind(k);
                    setError(undefined);
                  }}
                >
                  {KIND_LABELS[k]}
                </button>
              )}
            </For>
          </div>

          <Show when={NEEDS_INPUT[kind()]}>
            <input
              data-testid="add-column-input"
              class="rounded-2 border border-alpha-300 bg-alpha-50 p-2 text-sm"
              placeholder={kind() === "user" ? "npub1... または hex" : "nostr"}
              value={input()}
              onInput={(event) => setInput(event.currentTarget.value)}
            />
          </Show>

          <Button data-testid="add-column-submit" type="submit">
            追加
          </Button>
          <Button variant="border" type="button" onClick={close}>
            キャンセル
          </Button>

          <Show when={error()}>
            {(message) => (
              <p
                data-testid="add-column-error"
                class="w-full text-red-8 text-xs dark:text-red-4"
              >
                {message()}
              </p>
            )}
          </Show>
        </form>
      </Show>
    </div>
  );
};

export default AddColumnForm;
