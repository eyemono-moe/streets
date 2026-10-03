import { Collapsible } from "@ark-ui/solid/collapsible";
import {
  loadSettingsDetailsOpen,
  saveSettingsDetailsOpen,
  settingsDetailsStorageKey,
} from "@streets/core/settings/settings-details";
import { type ParentComponent, createSignal } from "solid-js";

const readOpen = (page: string): boolean => {
  try {
    return loadSettingsDetailsOpen(
      localStorage.getItem(settingsDetailsStorageKey(page)),
    );
  } catch {
    return false;
  }
};

/**
 * 設定のページの末尾に置く「詳しく」。あまり変えない設定や、いまの様子を
 * 見せるものを畳んでおき、よく変える設定がページの上に並ぶようにする。
 * 開閉はページごとにこの端末へ覚える。
 */
const SettingsDetails: ParentComponent<{
  /** 開閉を覚える鍵。設定のページの `value` を渡す。 */
  page: string;
  /** 畳んでいる間も見せる、中に何があるかの一言。 */
  summary: string;
  /** ストーリーで開いた状態を見せるため。アプリでは渡さない。 */
  defaultOpen?: boolean;
}> = (props) => {
  const [open, setOpen] = createSignal(
    props.defaultOpen ?? readOpen(props.page),
  );
  return (
    <Collapsible.Root
      lazyMount
      unmountOnExit
      open={open()}
      onOpenChange={(details) => {
        setOpen(details.open);
        try {
          localStorage.setItem(
            settingsDetailsStorageKey(props.page),
            saveSettingsDetailsOpen(details.open),
          );
        } catch {
          // 覚えられなくても、いまの開閉は効いている。
        }
      }}
      class="flex flex-col border-t border-primary pt-3"
    >
      <Collapsible.Trigger class="group flex w-full cursor-pointer items-start gap-1.5 rounded-2 bg-transparent p-0 text-left outline-none focus-visible:ring-2 focus-visible:ring-accent-5">
        <span
          class="i-material-symbols:expand-more-rounded c-secondary mt-0.5 size-5 shrink-0 transition-transform group-data-[state=open]:rotate-180"
          aria-hidden="true"
        />
        <span class="flex min-w-0 flex-col gap-0.5">
          <span class="c-primary font-600 text-body">詳しく</span>
          <span class="c-secondary text-caption">{props.summary}</span>
        </span>
      </Collapsible.Trigger>
      <Collapsible.Content class="motion-collapse">
        <div class="flex flex-col gap-7 pt-5">{props.children}</div>
      </Collapsible.Content>
    </Collapsible.Root>
  );
};

export default SettingsDetails;
