import { type Component, For, onCleanup, onMount } from "solid-js";
import { useDeck } from "../../Column/context/deck";
import { columnIcon } from "../../Column/libs/columnIcon";
import NavigateButton from "./NavigateButton";

const ShortcutButtons: Component = () => {
  const [deckState, { scrollIntoView }] = useDeck();

  // TODO: shortcut keyをまとめて別ファイルで管理する
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (
      e.target instanceof HTMLInputElement ||
      e.target instanceof HTMLTextAreaElement
    )
      return;

    switch (e.key) {
      case "1":
        scrollIntoView(0);
        break;
      case "2":
        scrollIntoView(1);
        break;
      case "3":
        scrollIntoView(2);
        break;
      case "4":
        scrollIntoView(3);
        break;
      case "5":
        scrollIntoView(4);
        break;
      case "6":
        scrollIntoView(5);
        break;
      case "7":
        scrollIntoView(6);
        break;
      case "8":
        scrollIntoView(7);
        break;
      case "9":
        scrollIntoView(8);
        break;
    }
  };

  onMount(() => {
    document.addEventListener("keydown", handleKeyDown);
  });

  onCleanup(() => {
    document.removeEventListener("keydown", handleKeyDown);
  });

  return (
    <>
      <For each={deckState.columns}>
        {(column, i) => (
          <div class="relative">
            <NavigateButton onClick={() => scrollIntoView(i())}>
              <div
                class={`${columnIcon(column.type)} aspect-square h-auto w-8`}
              />
              <div class="absolute right-0.5 bottom-0 text-3.5">{i() + 1}</div>
            </NavigateButton>
          </div>
        )}
      </For>
    </>
  );
};

export default ShortcutButtons;
