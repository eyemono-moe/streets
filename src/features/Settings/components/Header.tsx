import { useNavigate } from "@solidjs/router";
import { type Component, Show } from "solid-js";

const Header: Component<{
  title?: string;
  backTo?: string;
}> = (props) => {
  const navigate = useNavigate();
  return (
    <div class="flex w-full items-center gap-1 px-2 py-1 text-xl">
      <Show when={props.backTo} keyed>
        {(backTo) => (
          <button
            type="button"
            class="appearance-none bg-transparent"
            onClick={() => navigate(backTo)}
          >
            <div class="i-material-symbols:chevron-left-rounded aspect-square h-1lh w-auto" />
          </button>
        )}
      </Show>
      <div class="text-center font-500">{props.title}</div>
    </div>
  );
};

export default Header;
