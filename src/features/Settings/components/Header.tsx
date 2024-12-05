import { useNavigate } from "@solidjs/router";
import { type Component, Show } from "solid-js";
import { useDeck } from "../../Column/context/deck";

const Header: Component<{
  title?: string;
  backTo?: string;
}> = (props) => {
  const [, , layout] = useDeck();
  const navigate = useNavigate();

  return (
    <div class="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-1 px-2 py-1">
      <Show when={props.backTo}>
        {(backTo) => (
          <button
            type="button"
            class="appearance-none bg-transparent"
            onClick={() => navigate(backTo())}
          >
            <div class="i-material-symbols:chevron-left-rounded m--0.5 aspect-square h-1.25lh w-auto" />
          </button>
        )}
      </Show>
      <div class="font-500">{props.title}</div>
      <Show when={layout() === "vertical"}>
        <button
          type="button"
          class="appearance-none bg-transparent"
          onClick={() => navigate("/")}
        >
          <div class="i-material-symbols:close-rounded m--0.5 aspect-square h-1.25lh w-auto" />
        </button>
      </Show>
    </div>
  );
};

export default Header;
