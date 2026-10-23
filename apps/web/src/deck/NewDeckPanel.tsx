import { type Component, createSignal } from "solid-js";
import { t } from "../i18n/locale";
import { useDispatch } from "../ui-events";
import Button from "../ui/Button";
import SegmentedControl from "../ui/SegmentedControl";
import StorageHint from "../ui/StorageHint";
import TextField from "../ui/TextField";

/** 新しいデッキの最初のカラム。 */
export type NewDeckSource = "copy" | "default";

/**
 * 新しいデッキを作る。「デッキを編集する」から一段進んだところに出す。
 * 名前が空なら、候補の名前（`placeholder`）で作る。
 */
const NewDeckPanel: Component<{ placeholder: string; current: string }> = (
  props,
) => {
  const dispatch = useDispatch();
  const [name, setName] = createSignal("");
  const [from, setFrom] = createSignal<NewDeckSource>("copy");
  return (
    <form
      class="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-3 pb-4"
      onSubmit={(event) => {
        event.preventDefault();
        dispatch({
          type: "deck/add-deck",
          name: name().trim() || props.placeholder,
          from: from(),
        });
        setName("");
      }}
    >
      <p class="c-secondary text-caption">{t("deck.newDeck.description")}</p>
      <h3 class="flex items-center gap-1.5 font-600 text-body">
        {t("deck.newDeck.title")}
        <StorageHint scope="account" />
      </h3>
      <TextField
        label={t("deck.newDeck.name")}
        value={name()}
        placeholder={props.placeholder}
        onInput={setName}
      />
      <div class="flex flex-col gap-1">
        <span class="c-secondary font-600 text-caption">
          {t("deck.newDeck.firstColumns")}
        </span>
        <SegmentedControl
          label={t("deck.newDeck.firstColumns")}
          block
          options={[
            {
              value: "copy",
              label: t("deck.newDeck.copy", { name: props.current }),
            },
            { value: "default", label: t("deck.newDeck.default") },
          ]}
          value={from()}
          onChange={setFrom}
        />
      </div>
      <Button
        type="submit"
        variant="primary"
        icon="i-material-symbols:add-rounded"
      >
        {t("deck.newDeck.submit")}
      </Button>
    </form>
  );
};

export default NewDeckPanel;
