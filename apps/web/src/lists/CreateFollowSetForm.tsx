import { type Component, createSignal, onMount } from "solid-js";
import { t } from "../i18n/locale";
import Button from "../ui/Button";
import { textInputClass } from "../ui/TextField";

/**
 * 新しいリストの名前を打つ欄。「リストに追加」の中で、名前だけで作れるように
 * する。説明や画像は、後からリストの情報で足す。
 */
const CreateFollowSetForm: Component<{
  submitLabel: string;
  onSubmit: (title: string) => void;
  onCancel: () => void;
}> = (props) => {
  const [title, setTitle] = createSignal("");
  const [error, setError] = createSignal(false);
  let input: HTMLInputElement | undefined;
  // 開いてすぐ打てるようにする。後から差し込んだ欄には autofocus 属性が効かない。
  onMount(() => input?.focus({ preventScroll: true }));

  return (
    <form
      class="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        const trimmed = title().trim();
        if (!trimmed) {
          setError(true);
          return;
        }
        props.onSubmit(trimmed);
        setTitle("");
      }}
    >
      <input
        ref={input}
        class={`${textInputClass} w-full`}
        aria-label={t("lists.createForm.name")}
        placeholder={t("lists.createForm.name")}
        aria-invalid={error()}
        value={title()}
        onInput={(event) => {
          setTitle(event.currentTarget.value);
          setError(false);
        }}
      />
      <p
        class="text-caption"
        classList={{ "c-danger": error(), "c-secondary": !error() }}
      >
        {error()
          ? t("lists.createForm.nameRequired")
          : t("lists.createForm.visibleToOthers")}
      </p>
      <div class="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={() => props.onCancel()}>
          {t("lists.common.cancel")}
        </Button>
        <Button type="submit" variant="primary">
          {props.submitLabel}
        </Button>
      </div>
    </form>
  );
};

export default CreateFollowSetForm;
