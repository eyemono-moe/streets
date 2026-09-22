import type { EmojiSet } from "@streets/core/settings/emoji-set";
import { type Component, For, Show, createSignal } from "solid-js";
import UserLink from "../note/UserLink";
import { useDispatch } from "../ui-events";
import Button from "../ui/Button";
import { searchInputClass } from "../ui/TextField";
import { EmojiPreview } from "./EmojiSettingsView";

export type EmojiSetResult = {
  set: EmojiSet;
  /** もう自分の絵文字に入っている。 */
  added: boolean;
};

export type EmojiSetSearchViewProps = {
  results: readonly EmojiSetResult[];
  /** 問い合わせている途中。 */
  searching: boolean;
  /** 一度でも探したか。まだなら「見つかりません」を出さない。 */
  searched: boolean;
  /** 保存している途中は足させない。 */
  disabled: boolean;
  error?: string;
  onSearch: (text: string) => void;
};

/**
 * 絵文字セットを探す。名前のほかに npub や naddr も受ける —— kind:30030 を
 * 索引しているリレーは少なく、言葉だけでは見つからないことがあるため。
 */
const EmojiSetSearchView: Component<EmojiSetSearchViewProps> = (props) => {
  const [text, setText] = createSignal("");
  return (
    <div class="flex flex-col gap-2.5">
      <form
        class="flex flex-wrap items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          props.onSearch(text());
        }}
      >
        <input
          class={`${searchInputClass} min-w-48 flex-1`}
          placeholder="ねこ / npub1… / naddr1…"
          aria-label="絵文字セットを探す"
          aria-invalid={props.error !== undefined}
          aria-describedby={props.error ? "emoji-set-search-error" : undefined}
          value={text()}
          onInput={(event) => setText(event.currentTarget.value)}
        />
        <Button
          type="submit"
          variant="primary"
          icon="i-material-symbols:search-rounded"
        >
          探す
        </Button>
      </form>
      <Show
        when={props.error}
        fallback={
          <p class="c-secondary text-caption">
            名前で探すほか、作った人（npub）やセットの住所（naddr）を貼っても取り込めます。
          </p>
        }
      >
        {(message) => (
          <p id="emoji-set-search-error" class="c-danger text-caption">
            {message()}
          </p>
        )}
      </Show>
      <Show when={props.searching}>
        <p class="c-secondary text-caption">探しています…</p>
      </Show>
      <Show when={props.results.length > 0}>
        <ul class="flex flex-col gap-px overflow-hidden rounded-2 border border-primary bg-tertiary">
          <For each={props.results}>
            {(result) => (
              <ResultRow result={result} disabled={props.disabled} />
            )}
          </For>
        </ul>
      </Show>
      <Show
        when={props.searched && !props.searching && props.results.length === 0}
      >
        <p class="c-secondary rounded-2 border border-primary p-3 text-caption">
          見つかりませんでした。絵文字セットを索引しているリレーは多くありません。作った人の
          npub か、セットの naddr を貼ってみてください。
        </p>
      </Show>
    </div>
  );
};

const ResultRow: Component<{ result: EmojiSetResult; disabled: boolean }> = (
  props,
) => {
  const dispatch = useDispatch();
  const set = () => props.result.set;
  return (
    <li class="flex flex-col gap-2 bg-primary px-3 py-2.5">
      <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span class="c-primary min-w-32 flex-1 break-all font-600 text-body">
          {set().title}
        </span>
        <UserLink pubkey={set().pubkey} class="c-secondary text-caption" />
        <Show
          when={!props.result.added}
          fallback={<span class="c-secondary text-caption">入っています</span>}
        >
          <Button
            variant="secondary"
            size="sm"
            icon="i-material-symbols:add-rounded"
            disabled={props.disabled}
            onClick={() =>
              dispatch({
                type: "emoji-set/add",
                ref: { pubkey: set().pubkey, identifier: set().identifier },
              })
            }
          >
            入れる
          </Button>
        </Show>
      </div>
      <div class="flex flex-wrap items-center gap-1.5">
        <For each={set().emojis.slice(0, 12)}>
          {(emoji) => <EmojiPreview emoji={emoji} />}
        </For>
        <Show when={set().emojis.length > 12}>
          <span class="c-secondary text-caption">
            ほか {set().emojis.length - 12}
          </span>
        </Show>
        <Show when={set().emojis.length === 0}>
          <span class="c-secondary text-caption">絵文字が入っていません</span>
        </Show>
      </div>
    </li>
  );
};

export default EmojiSetSearchView;
