import { Collapsible } from "@ark-ui/solid/collapsible";
import type { ReactionInput } from "@streets/core/nostr/build/reaction";
import { encodeNaddr } from "@streets/core/nostr/nip19";
import {
  type CustomEmoji,
  EMOJI_SET_KIND,
  type EmojiSetRef,
  emojiShortcodeFromFileName,
  isEmojiShortcode,
} from "@streets/core/settings/emoji-list";
import type { EmojiSet } from "@streets/core/settings/emoji-set";
import {
  type Component,
  For,
  type JSX,
  Show,
  createSignal,
  onCleanup,
} from "solid-js";
import { NoUploadServerError, useUploader } from "../media/uploader";
import UserLink from "../note/UserLink";
import { useDispatch } from "../ui-events";
import Button, { ButtonLink } from "../ui/Button";
import { textInputClass } from "../ui/TextField";
import DefaultReactionField from "./DefaultReactionField";
import SettingsSection from "./SettingsSection";

/** 参照しているセット 1 つ。中身がまだ届いていないこともある。 */
export type EmojiSetRow = {
  ref: EmojiSetRef;
  set: EmojiSet | undefined;
};

export type EmojiSettingsViewProps = {
  /** 「絵文字セットを探す」の中身。読み取り層を触るので外から渡す。 */
  search?: JSX.Element;
  /** 直接持っている絵文字（kind:10030 の `emoji` タグ）。 */
  emojis: readonly CustomEmoji[];
  sets: readonly EmojiSetRow[];
  saving: boolean;
  /** いいねボタンで送るリアクション（この端末の設定）。 */
  defaultReaction: ReactionInput;
};

/**
 * 絵文字 1 つ。読めない URL でも、何が入っているかが消えないようにする。
 * 名前を隣に出している場所（`named`）では、代わりに読めない印だけを出す。
 */
export const EmojiPreview: Component<{
  emoji: CustomEmoji;
  named?: boolean;
}> = (props) => {
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
      title="いいねボタンの絵文字"
      scope="device"
      description="投稿の下のいいねボタンを押したときに送る絵文字です。選ばなければハートを送ります。"
    >
      <DefaultReactionField value={props.defaultReaction} />
    </SettingsSection>

    <SettingsSection
      title="自分の絵文字リスト"
      scope="account"
      description="リアクションのピッカーに出る絵文字の一覧です。誰かが作った絵文字セットを入れることも、絵文字を自分で 1 つずつ足すこともできます。"
    >
      <Show
        when={props.sets.length > 0 || props.emojis.length > 0}
        fallback={
          <p class="c-secondary rounded-2 border border-primary p-3 text-caption">
            まだ何も入っていません。下から絵文字を追加すると、リアクションのピッカーに出るようになります。
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

    <Show when={props.search}>
      {(search) => (
        <SettingsSection
          title="絵文字セットを探す"
          description="誰かが作った絵文字セットを見つけて、自分の絵文字リストに加えられます。"
        >
          {search() as never}
        </SettingsSection>
      )}
    </Show>

    <SettingsSection
      title="もっと絵文字を管理する"
      description="絵文字セットの作成・整理は、専用のクライアントからも可能です。外部クライアントで設定した絵文字はStreetsにも反映されます。"
    >
      <div class="flex">
        <ButtonLink
          variant="secondary"
          size="sm"
          icon="i-material-symbols:open-in-new-rounded"
          href="https://koteitan.github.io/emoemo/"
          target="_blank"
          rel="noopener noreferrer"
        >
          emoemo を開く
        </ButtonLink>
      </div>
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
                    {(emoji) => <EmojiPreview emoji={emoji} />}
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
                      <EmojiPreview emoji={emoji} named />
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
      <EmojiPreview emoji={props.emoji} named />
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
  const uploader = useUploader();
  const [shortcode, setShortcode] = createSignal("");
  const [url, setUrl] = createSignal("");
  const [error, setError] = createSignal<string>();
  const [uploading, setUploading] = createSignal(false);
  let picker: HTMLInputElement | undefined;

  const name = () => shortcode().trim().replace(/^:|:$/g, "");

  const submit = () => {
    const src = url().trim();
    if (name() === "" || src === "") {
      setError("名前と画像の URL を両方入力してください");
      return;
    }
    if (!isEmojiShortcode(name())) {
      setError("名前は半角の英数字と _ - だけが使えます");
      return;
    }
    if (!/^https?:\/\//i.test(src)) {
      setError("画像の URL は http:// か https:// で始めてください");
      return;
    }
    dispatch({ type: "emoji/add", shortcode: name(), url: src });
    setShortcode("");
    setUrl("");
    setError(undefined);
  };

  const uploadImage = async (file: File) => {
    if (!uploader) return;
    setUploading(true);
    setError(undefined);
    try {
      const blob = await uploader.upload(file);
      setUrl(blob.url);
      // 名前をまだ決めていなければ、ファイル名から埋める。
      if (name() === "") setShortcode(emojiShortcodeFromFileName(file.name));
    } catch (cause) {
      setError(
        cause instanceof NoUploadServerError
          ? "画像のアップロード先が設定されていません。「画像」の設定で追加してください。"
          : "画像をアップロードできませんでした",
      );
    } finally {
      setUploading(false);
    }
  };

  const replacing = () =>
    props.emojis.some((emoji) => emoji.shortcode === name());

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
          class={`${textInputClass} w-32`}
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
          class={`${textInputClass} min-w-48 flex-1`}
          placeholder="https://example/neko.png"
          aria-label="絵文字の画像の URL"
          aria-invalid={error() !== undefined}
          aria-describedby={error() ? "emoji-add-error" : undefined}
          value={url()}
          disabled={props.disabled || uploading()}
          onInput={(event) => {
            setUrl(event.currentTarget.value);
            setError(undefined);
          }}
        />
        <Show when={uploader}>
          {/* 画像を選んで上げる。URL を手で用意しなくても足せるように。 */}
          <input
            ref={picker}
            type="file"
            accept="image/*"
            class="hidden"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = "";
              if (file) void uploadImage(file);
            }}
          />
          <Button
            variant="secondary"
            icon="i-material-symbols:upload-rounded"
            disabled={props.disabled || uploading()}
            onClick={() => picker?.click()}
          >
            {uploading() ? "アップロード中…" : "画像を選ぶ"}
          </Button>
        </Show>
        <Button
          type="submit"
          variant="primary"
          icon="i-material-symbols:add-rounded"
          disabled={props.disabled || uploading()}
        >
          追加
        </Button>
      </div>
      <Show
        when={error()}
        fallback={
          <p class="c-secondary text-caption">
            {replacing()
              ? "同じ名前の絵文字が既に存在します。この状態で追加すると画像を更新することができます。"
              : "名前に使えるのは半角の英数字と _ - です（例: neko）。日本語や記号は使えません。"}
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
