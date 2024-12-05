import { useNavigate } from "@solidjs/router";
import { type Component, Show } from "solid-js";
import { useDeck } from "../features/Column/context/deck";
import PostInput from "../features/CreatePost/components/PostInput";

const Post: Component = () => {
  const [, , layout] = useDeck();
  const navigate = useNavigate();

  return (
    <div>
      <Show when={layout() === "vertical"}>
        <button
          type="button"
          class="appearance-none bg-transparent"
          onClick={() => navigate("/")}
        >
          <div class="i-material-symbols:close-rounded aspect-square h-1lh w-auto" />
        </button>
      </Show>
      <PostInput />
    </div>
  );
};

export default Post;
