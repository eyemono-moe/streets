import { type Component, For, Show, createSignal } from "solid-js";
import Name from "../note/Name";
import Button from "../ui/Button";
import UiSwitch from "../ui/Switch";
import ColumnSheet from "./ColumnSheet";

export type WriteSheetProps = {
  /** 頼んだアップレットの名前。 */
  source: string;
  /** 何を書くか（「短いテキスト投稿」など）。 */
  kindLabel: string;
  kind: number;
  content: string;
  /** 本文の中で名指しされた人（`p` タグ）。 */
  mentions: readonly string[];
  tagCount: number;
  /** 暗号化して送る相手。 */
  recipient?: string;
  /** いまある設定やリストを置き換える・消す。 */
  overwrites: boolean;
  /** 「今後は確認しない」を出せるか。 */
  rememberable: boolean;
  onApprove: (remember: boolean) => void;
  onCancel: () => void;
};

const MENTIONS_SHOWN = 3;

/**
 * アップレットから書き込みを頼まれたときに、頼んだカラムの中に出すシート。何を書くかを
 * 見せ、押すまでそのカラムを触れなくする（どのアップレットが書こうとしているかが
 * 見て分かる）。
 */
const WriteSheet: Component<WriteSheetProps> = (props) => {
  const [remember, setRemember] = createSignal(false);
  return (
    <ColumnSheet
      label={`${props.source} からの書き込み`}
      source={props.source}
      title={
        <>あなたのアカウントで「{props.kindLabel}」を書き込もうとしています</>
      }
      onCancel={() => props.onCancel()}
    >
      <Show when={props.overwrites}>
        <p class="c-status-warn flex items-start gap-1 text-caption">
          <span
            class="i-material-symbols:warning-outline-rounded mt-0.5 size-3.5 shrink-0"
            aria-hidden="true"
          />
          <span>
            {props.kind === 5
              ? "あなたの投稿などを消す依頼です。"
              : "いまある同じ種類の設定やリストを、これで置き換えます。"}
          </span>
        </p>
      </Show>
      <Show when={props.recipient}>
        {(recipient) => (
          <p class="c-secondary flex min-w-0 items-center gap-1 text-caption">
            <span
              class="i-material-symbols:lock-outline-rounded size-3.5 shrink-0"
              aria-hidden="true"
            />
            <span class="shrink-0">宛先：</span>
            <span class="min-w-0 truncate">
              <Name pubkey={recipient()} />
            </span>
            <span class="shrink-0">（暗号化して送ります）</span>
          </p>
        )}
      </Show>
      <div class="c-primary max-h-48 overflow-y-auto whitespace-pre-wrap break-anywhere rounded-2 border border-primary bg-secondary px-3 py-2 text-body">
        <Show
          when={props.content.trim()}
          fallback={<span class="c-secondary">（本文はありません）</span>}
        >
          {props.content}
        </Show>
      </div>
      {/* 置き換えるものは、空でも数を見せる（空のフォローリストは、全員のフォローを外す）。 */}
      <Show
        when={
          props.mentions.length > 0 || props.tagCount > 0 || props.overwrites
        }
      >
        <p class="c-secondary flex flex-wrap items-center gap-x-1 text-caption">
          <Show when={props.mentions.length > 0}>
            <span>名指し：</span>
            <For each={props.mentions.slice(0, MENTIONS_SHOWN)}>
              {(pubkey) => (
                <span class="max-w-32 truncate">
                  <Name pubkey={pubkey} />
                </span>
              )}
            </For>
            <Show when={props.mentions.length > MENTIONS_SHOWN}>
              <span>ほか {props.mentions.length - MENTIONS_SHOWN} 人</span>
            </Show>
            <span>・</span>
          </Show>
          <span>タグ {props.tagCount} 個</span>
        </p>
      </Show>
      <Show when={props.rememberable}>
        <UiSwitch
          label={`このアップレットの「${props.kindLabel}」は、今後は確認しない`}
          checked={remember()}
          onChange={setRemember}
        />
      </Show>
      <div class="flex justify-end gap-2">
        <Button onClick={() => props.onCancel()}>やめる</Button>
        <Button variant="primary" onClick={() => props.onApprove(remember())}>
          書き込む
        </Button>
      </div>
    </ColumnSheet>
  );
};

export default WriteSheet;
