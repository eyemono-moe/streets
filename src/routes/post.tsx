import { useNavigate } from "@solidjs/router";
import { type Component, Show } from "solid-js";
import { useDeck } from "../features/Column/context/deck";
import PostInput from "../features/CreatePost/components/PostInput";
import { useI18n } from "../i18n";

const Post: Component = () => {
  const t = useI18n();

  const [, , layout] = useDeck();
  const navigate = useNavigate();

  return (
    <div class="grid h-full grid-rows-[auto_minmax(0,1fr)]">
      <Show when={layout() === "vertical"}>
        <div class="flex">
          <button
            type="button"
            class="ml-auto appearance-none bg-transparent p-1"
            onClick={() => navigate("/")}
          >
            {t("postInput.cancel")}
          </button>
        </div>
      </Show>
      <div class="overflow-y-auto">
        <PostInput />
      </div>
    </div>
  );
};

export default Post;
