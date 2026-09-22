import { Collapsible } from "@ark-ui/solid/collapsible";
import { encodeNaddr } from "@streets/core/nostr/nip19";
import {
  type CustomEmoji,
  EMOJI_SET_KIND,
  type EmojiSetRef,
} from "@streets/core/settings/emoji-list";
import type { EmojiSet } from "@streets/core/settings/emoji-set";
import { type Component, For, Show, createSignal, onCleanup } from "solid-js";
import UserLink from "../note/UserLink";
import { useDispatch } from "../ui-events";
import Button from "../ui/Button";
import SettingsSection from "./SettingsSection";

/** 参照しているセット 1 つ。中身がまだ届いていないこともある。 */
export type EmojiSetRow = {
  ref: EmojiSetRef;
  set: EmojiSet | undefined;
};

export type EmojiSettingsViewProps = {
  /** 直接持っている絵文字（kind:10030 の `emoji` タグ）。 */
  emojis: readonly CustomEmoji[];
  sets: readonly EmojiSetRow[];
  saving: boolean;
};

/**
 * 絵文字 1 つ。読めない URL でも、何が入っているかが消えないようにする。
 * 名前を隣に出している場所（`named`）では、代わりに読めない印だけを出す。
 */
const Emoji: Component<{ emoji: CustomEmoji; named?: boolean }> = (props) => {
  const [broken, setBroken] = createSignal(false);
  return (
    <Show
      when={!broken()}
      fallback={
        <Show
          when={props.named}
          fallback={
            <span class="c-secondary text-caption">{`:${props.emoji.shortcode}:`}</span>
          }
        >
          <span
            class="i-material-symbols:broken-image-outline-rounded c-secondary size-5"
            title="画像を読み込めませんでした"
          />
        </Show>
      }
    >
      <img
        src={props.emoji.url}
        alt={`:${props.emoji.shortcode}:`}
        title={`:${props.emoji.shortcode}:`}
        loading="lazy"
        class="size-6 object-contain"
        onError={() => setBroken(true)}
      />
    </Show>
  );
};

/**
 * 自分の絵文字の設定。ピッカーに出るものをここで決める。セットは「外す」だけ
 * で、セットそのものは消さない —— 作った人のものだから。
 */
const EmojiSettingsView: Component<EmojiSettingsViewProps> = (props) => (
  <div class="flex flex-col gap-7">
    <SettingsSection
      title="自分の絵文字"
      scope="account"
      description="リアクションのピッカーに出る絵文字です。誰かが作った絵文字セット（NIP-30 の kind:30030）を入れることも、絵文字を 1 つずつ足すこともできます。"
    >
      <Show
        when={props.sets.length > 0 || props.emojis.length > 0}
        fallback={
          <p class="c-secondary rounded-2 border border-primary p-3 text-caption">
            まだ何も入っていません。下から絵文字を足すと、リアクションのピッカーに出るようになります。
          </p>
        }
      >
        <ul class="flex flex-col gap-px overflow-hidden rounded-2 border border-primary bg-tertiary">
          <For each={props.sets}>
            {(row) => <SetRow row={row} disabled={props.saving} />}
          </For>
          <Show when={props.emojis.length > 0}>
            <li class="flex flex-col gap-2 bg-primary px-3 py-2.5">
              <span class="c-secondary font-600 text-caption">
                1 つずつ足した絵文字
              </span>
              <ul class="flex flex-col gap-1.5">
                <For each={props.emojis}>
                  {(emoji) => (
                    <EmojiRow emoji={emoji} disabled={props.saving} />
                  )}
                </For>
              </ul>
            </li>
          </Show>
        </ul>
      </Show>
      <AddEmoji emojis={props.emojis} disabled={props.saving} />
    </SettingsSection>
  </div>
);

const SetRow: Component<{ row: EmojiSetRow; disabled: boolean }> = (props) => {
  const dispatch = useDispatch();
  const name = () => props.row.set?.title ?? props.row.ref.identifier;
  const emojis = () => props.row.set?.emojis ?? [];
  return (
    <li class="bg-primary px-3 py-2.5">
      <Collapsible.Root>
        <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Collapsible.Trigger class="c-primary group flex min-w-32 flex-1 cursor-pointer items-center gap-1 bg-transparent text-left font-600 text-body">
            <span
              class="i-material-symbols:arrow-drop-down-rounded c-secondary group-data-[state=closed]:-rotate-90 size-5 shrink-0 transition-transform"
              aria-hidden="true"
            />
            <span class="min-w-0 break-all">{name()}</span>
          </Collapsible.Trigger>
          <UserLink
            pubkey={props.row.ref.pubkey}
            class="c-secondary text-caption"
          />
          <Button
            variant="ghost"
            size="sm"
            shape="rounded"
            icon="i-material-symbols:do-not-disturb-on-outline-rounded"
            aria-label={`${name()} を自分の絵文字から外す`}
            title="外す"
            disabled={props.disabled}
            onClick={() =>
              dispatch({ type: "emoji-set/remove", ref: props.row.ref })
            }
          />
        </div>
        <Show
          when={props.row.set}
          fallback={<span class="c-secondary text-caption">読み込み中…</span>}
        >
          {/* 閉じている間は、中身の見本だけを 1 行で出す。 */}
          <Collapsible.Context>
            {(api) => (
              <Show when={!api().open}>
                <div class="flex flex-wrap items-center gap-1.5">
                  <For each={emojis().slice(0, 12)}>
                    {(emoji) => <Emoji emoji={emoji} />}
                  </For>
                  <Show when={emojis().length > 12}>
                    <span class="c-secondary text-caption">
                      ほか {emojis().length - 12}
                    </span>
                  </Show>
                </div>
              </Show>
            )}
          </Collapsible.Context>
        </Show>
        <Collapsible.Content class="motion-collapse">
          <div class="flex flex-col gap-2 pt-2">
            <Show when={emojis().length > 0}>
              <ul class="flex flex-col gap-1.5">
                <For each={emojis()}>
                  {(emoji) => (
                    <li class="flex items-center gap-2">
                      <Emoji emoji={emoji} named />
                      <span class="c-primary min-w-0 flex-1 break-all text-body">
                        {`:${emoji.shortcode}:`}
                      </span>
                    </li>
                  )}
                </For>
              </ul>
            </Show>
            <SetAddress target={props.row.ref} />
          </div>
        </Collapsible.Content>
      </Collapsible.Root>
    </li>
  );
};

/**
 * セットの住所。外したあとに入れ直したり、人に渡したりするために出す
 * （他クライアントは naddr で受け取る）。
 */
// `ref` という名前では渡せない（Solid が要素の参照として横取りする）。
const SetAddress: Component<{ target: EmojiSetRef }> = (props) => {
  const naddr = () =>
    encodeNaddr({
      identifier: props.target.identifier,
      pubkey: props.target.pubkey,
      eventKind: EMOJI_SET_KIND,
    });
  const [copied, setCopied] = createSignal<string>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  onCleanup(() => clearTimeout(timer));
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied("コピーしました");
    } catch {
      // 安全でない接続や、権限を断られたとき。黙っていると壊れて見える。
      setCopied("コピーできませんでした");
    }
    clearTimeout(timer);
    timer = setTimeout(() => setCopied(undefined), 2500);
  };

  return (
    <Show when={naddr()}>
      {(naddr) => (
        <div class="flex flex-wrap items-center gap-2 rounded-2 border border-primary p-2.5">
          <code class="c-secondary min-w-0 flex-1 break-all text-caption">
            {naddr()}
          </code>
          <Button
            variant="secondary"
            size="sm"
            icon="i-material-symbols:content-copy-outline-rounded"
            onClick={() => void copy(naddr())}
          >
            {copied() ?? "コピー"}
          </Button>
        </div>
      )}
    </Show>
  );
};

const EmojiRow: Component<{ emoji: CustomEmoji; disabled: boolean }> = (
  props,
) => {
  const dispatch = useDispatch();
  return (
    <li class="flex items-center gap-2">
      <Emoji emoji={props.emoji} named />
      <span class="c-primary min-w-0 flex-1 break-all text-body">
        {`:${props.emoji.shortcode}:`}
      </span>
      <Button
        variant="ghost"
        size="sm"
        shape="rounded"
        icon="i-material-symbols:do-not-disturb-on-outline-rounded"
        aria-label={`:${props.emoji.shortcode}: を外す`}
        title="外す"
        disabled={props.disabled}
        onClick={() =>
          dispatch({ type: "emoji/remove", shortcode: props.emoji.shortcode })
        }
      />
    </li>
  );
};

const AddEmoji: Component<{
  emojis: readonly CustomEmoji[];
  disabled: boolean;
}> = (props) => {
  const dispatch = useDispatch();
  const [shortcode, setShortcode] = createSignal("");
  const [url, setUrl] = createSignal("");
  const [error, setError] = createSignal<string>();

  const submit = () => {
    // 打つ人は `:name:` の形で覚えているので、前後の `:` は落として受ける。
    const name = shortcode().trim().replace(/^:|:$/g, "");
    const src = url().trim();
    if (name === "" || src === "") {
      setError("名前と画像の URL を両方入力してください");
      return;
    }
    if (!/^[0-9a-zA-Z_-]+$/.test(name)) {
      setError("名前は半角の英数字と _ - だけが使えます");
      return;
    }
    if (!/^https?:\/\//i.test(src)) {
      setError("画像の URL は http:// か https:// で始めてください");
      return;
    }
    dispatch({ type: "emoji/add", shortcode: name, url: src });
    setShortcode("");
    setUrl("");
    setError(undefined);
  };

  const replacing = () =>
    props.emojis.some(
      (emoji) => emoji.shortcode === shortcode().trim().replace(/^:|:$/g, ""),
    );

  return (
    <form
      class="flex flex-col gap-1.5"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <span class="c-secondary font-600 text-caption">絵文字を 1 つ足す</span>
      <div class="flex flex-wrap items-center gap-2">
        <input
          class="c-primary placeholder:c-secondary h-8.5 w-32 rounded-full border border-primary bg-primary px-3.5 text-body outline-none focus-visible:border-accent-5"
          placeholder="名前"
          aria-label="絵文字の名前"
          value={shortcode()}
          disabled={props.disabled}
          onInput={(event) => {
            setShortcode(event.currentTarget.value);
            setError(undefined);
          }}
        />
        <input
          class="c-primary placeholder:c-secondary h-8.5 min-w-48 flex-1 rounded-full border border-primary bg-primary px-3.5 text-body outline-none focus-visible:border-accent-5"
          placeholder="https://example/neko.png"
          aria-label="絵文字の画像の URL"
          aria-invalid={error() !== undefined}
          aria-describedby={error() ? "emoji-add-error" : undefined}
          value={url()}
          disabled={props.disabled}
          onInput={(event) => {
            setUrl(event.currentTarget.value);
            setError(undefined);
          }}
        />
        <Button
          type="submit"
          variant="primary"
          icon="i-material-symbols:add-rounded"
          disabled={props.disabled}
        >
          追加
        </Button>
      </div>
      <Show
        when={error()}
        fallback={
          <p class="c-secondary text-caption">
            {replacing()
              ? "同じ名前の絵文字が既にあります。足すと画像が入れ替わります。"
              : "名前は `:` で囲まずに入力してください（例: neko）。"}
          </p>
        }
      >
        {(message) => (
          <p id="emoji-add-error" class="c-danger text-caption">
            {message()}
          </p>
        )}
      </Show>
    </form>
  );
};

export default EmojiSettingsView;
