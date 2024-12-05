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
    <div class="flex h-full flex-col">
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
      <div class="grow overflow-y-auto">
        <PostInput />
      </div>
    </div>
  );
};

export default Post;
