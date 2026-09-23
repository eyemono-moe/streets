import { type Component, Show, createSignal } from "solid-js";
import Button from "../ui/Button";
import { textInputClass } from "../ui/TextField";
import { GUIDE, GuideLink } from "./guide";

/** 秘密鍵を貼られたときに、受け付けない理由を出す（ADR-0008）。 */
const looksLikeSecretKey = (input: string) =>
  /^nsec1/i.test(input.trim()) || /^[0-9a-f]{64}$/i.test(input.trim());

/** 署名器が出す `bunker://` を貼り付けて繋ぐ。 */
const BunkerForm: Component<{
  pending: boolean;
  onBunker: (uri: string) => void;
  /** 入力欄の最初の値。ストーリーで貼り付けた後の見た目を出すため。 */
  initialValue?: string;
}> = (props) => {
  const [value, setValue] = createSignal(props.initialValue ?? "");
  const secretKey = () => looksLikeSecretKey(value());
  return (
    <form
      class="flex flex-col gap-1.5"
      onSubmit={(event) => {
        event.preventDefault();
        if (!secretKey()) props.onBunker(value().trim());
      }}
    >
      <label for="bunker-uri" class="sr-only">
        bunker:// で始まる文字列
      </label>
      <div class="flex gap-2">
        <input
          id="bunker-uri"
          type="password"
          autocomplete="off"
          spellcheck={false}
          placeholder="bunker://…"
          class={`${textInputClass} min-w-0 flex-1`}
          aria-invalid={secretKey()}
          aria-describedby="bunker-uri-note"
          value={value()}
          onInput={(event) => setValue(event.currentTarget.value)}
        />
        <Button
          type="submit"
          shape="rounded"
          class="h-9"
          disabled={props.pending || !value().trim() || secretKey()}
        >
          接続
        </Button>
      </div>
      <Show
        when={secretKey()}
        fallback={
          <p id="bunker-uri-note" class="c-secondary text-caption">
            署名器が表示する、bunker:// で始まる文字列を貼り付けます。
          </p>
        }
      >
        <p id="bunker-uri-note" class="c-danger text-caption">
          これは秘密鍵です。Streets
          は秘密鍵を受け付けません。秘密鍵が一度でも漏れると、アカウントを取り戻す方法がないためです。拡張機能か署名器に秘密鍵を預けてから、そちらでログインしてください。
          <GuideLink href={`${GUIDE}/faq.html#why-is-nsec-confidential`}>
            秘密鍵を人に渡してはいけない理由
          </GuideLink>
        </p>
      </Show>
    </form>
  );
};

export default BunkerForm;
