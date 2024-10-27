import { createPresence } from "@solid-primitives/presence";
import { Show } from "solid-js";
import { useScrollToTop } from "../../../shared/libs/useScrollToTop";

export const useColumnScrollButton = () => {
  const { setTarget, isTop, scrollToTop } = useScrollToTop();
  const presence = createPresence(() => !isTop(), {
    transitionDuration: 100,
  });

  const ScrollButton = () => {
    return (
      <Show when={presence.isMounted()}>
        <div
          class="sticky top-0 right-0 left-0 z-1 flex h-0 justify-center"
          data-visible={presence.isVisible()}
        >
          <button
            type="button"
            onClick={scrollToTop}
            data-visible={presence.isVisible()}
            class="mt-1 h-fit appearance-none rounded-full bg-accent-primary p-1 text-white shadow shadow-ui/25 active:bg-accent-active not-active:enabled:hover:bg-accent-hover data-[visible='false']:animate-duration-100 data-[visible='false']:animate-slide-out-up data-[visible='true']:animate-duration-100 data-[visible='true']:animate-slide-in-down"
          >
            <div class="i-material-symbols:vertical-align-top-rounded aspect-square h-auto w-4" />
          </button>
        </div>
      </Show>
    );
  };

  return { ScrollButton, setTarget };
};
