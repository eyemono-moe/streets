import { type Component, createSignal } from "solid-js";
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
      <p class="c-secondary text-caption">
        用途ごとにカラムの並びを分けて持てます（スマホ用・PC
        用など）。どのデッキを開いているかは、この端末に覚えます。
      </p>
      <h3 class="flex items-center gap-1.5 font-600 text-body">
        新しいデッキの設定
        <StorageHint scope="account" />
      </h3>
      <TextField
        label="名前"
        value={name()}
        placeholder={props.placeholder}
        onInput={setName}
      />
      <div class="flex flex-col gap-1">
        <span class="c-secondary font-600 text-caption">最初のカラム</span>
        <SegmentedControl
          label="最初のカラム"
          block
          options={[
            { value: "copy", label: `「${props.current}」を複製` },
            { value: "default", label: "はじめの構成" },
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
        作って開く
      </Button>
    </form>
  );
};

export default NewDeckPanel;
