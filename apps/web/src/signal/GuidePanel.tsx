import { useLocation } from "@solidjs/router";
import { guideByPath, guideCategoryByPath } from "@streets/core/signal/guides";
import { type Component, Match, Switch } from "solid-js";
import { useDispatch } from "../ui-events";
import IconButton from "../ui/IconButton";
import GuideBrowserView from "./GuideBrowserView";
import GuidePageView from "./GuidePageView";

/** URL を内容だけに使い、デッキと独立して開閉する案内パネル。 */
export const GuidePanelView: Component<{ path: string }> = (props) => {
  const dispatch = useDispatch();
  return (
    <section
      class="flex h-full min-h-0 flex-col bg-primary"
      aria-label="Streets の使い方"
    >
      <header class="flex h-12 shrink-0 items-center gap-2.5 border-primary border-b px-3">
        <span
          class="i-material-symbols:help-outline-rounded c-secondary size-5 shrink-0"
          aria-hidden="true"
        />
        <h2 class="min-w-0 flex-1 truncate font-600 text-body">使い方を探す</h2>
        <IconButton
          variant="filled"
          size="md"
          icon="i-material-symbols:close-rounded"
          label="案内を閉じる"
          onClick={() => dispatch({ type: "signal/close-guide" })}
        />
      </header>
      <div class="min-h-0 flex-1">
        <Switch fallback={<GuidePageView />}>
          <Match when={props.path === "/help"}>
            <GuideBrowserView />
          </Match>
          <Match when={guideCategoryByPath(props.path)}>
            {(category) => <GuideBrowserView category={category()} />}
          </Match>
          <Match when={guideByPath(props.path)}>
            {(guide) => <GuidePageView guide={guide()} />}
          </Match>
        </Switch>
      </div>
    </section>
  );
};

const GuidePanel: Component = () => {
  const location = useLocation();
  return <GuidePanelView path={location.pathname} />;
};

export default GuidePanel;
