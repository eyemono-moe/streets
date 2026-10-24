import { type Component, Show, createSignal } from "solid-js";
import { t } from "../i18n/locale";
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
        {t("welcome.bunker.label")}
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
          {t("welcome.bunker.submit")}
        </Button>
      </div>
      <Show
        when={secretKey()}
        fallback={
          <p id="bunker-uri-note" class="c-secondary text-caption">
            {t("welcome.bunker.note")}
          </p>
        }
      >
        <p id="bunker-uri-note" class="c-danger text-caption">
          {t("welcome.bunker.secretKey")}
          <GuideLink href={`${GUIDE}/faq.html#why-is-nsec-confidential`}>
            {t("welcome.bunker.secretKeyReason")}
          </GuideLink>
        </p>
      </Show>
    </form>
  );
};

export default BunkerForm;
