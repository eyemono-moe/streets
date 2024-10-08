import { Collapsible } from "@kobalte/core/collapsible";
import { type Component, createSignal } from "solid-js";
import { useSendShortText } from "../../../libs/rxQuery";

const Sidebar: Component = () => {
  const [texts, setTexts] = createSignal("");

  const { sendShortText, sendState } = useSendShortText();

  const postText = () => {
    if (texts() === "") {
      return;
    }
    sendShortText({
      content: texts(),
    });
  };

  return (
    <Collapsible>
      <div class="flex h-full divide-x">
        <div class="c-zinc-6 grid grid-rows-[auto_1fr_auto] p-1">
          <div class="flex flex-col gap-2">
            <Collapsible.Trigger>
              <div class="i-material-symbols:edit-square-outline-rounded aspect-square h-auto w-8" />
            </Collapsible.Trigger>
            <div class="i-material-symbols:search-rounded aspect-square h-auto w-8" />
          </div>
          <div>{/* TODO: 開いているcolumnへのショートカット */}</div>
          <div>
            <div class="i-material-symbols:add-rounded aspect-square h-auto w-8" />
          </div>
        </div>
        <Collapsible.Content>
          <div class="flex flex-col gap-1">
            <textarea
              class="b-1"
              value={texts()}
              onInput={(e) => setTexts(e.currentTarget.value)}
            />
            <button type="button" onClick={postText}>
              post
            </button>
          </div>
          <pre>{JSON.stringify(sendState, null, 2)}</pre>
        </Collapsible.Content>
      </div>
    </Collapsible>
  );
};

export default Sidebar;
