import { For, Show, createSignal } from "solid-js";
import type { Component } from "solid-js";
import type { ColumnAlert } from "../../core/deck/column-alerts";

/**
 * カラムの「行動できる異常」の表示口。`DiagnosticsPanel` と対照的に
 * `developerMode` を見ない —— 行動できる異常は常時表示する。
 */
const ColumnAlertBadge: Component<{ alerts: () => ColumnAlert[] }> = (
  props,
) => {
  const [open, setOpen] = createSignal(false);

  return (
    <Show when={props.alerts().length > 0}>
      <div class="relative shrink-0">
        <button
          type="button"
          data-testid="column-alert"
          class="rounded-full px-2 py-1 text-xs enabled:cursor-pointer"
          onClick={() => setOpen((prev) => !prev)}
        >
          ⚠
        </button>
        <Show when={open()}>
          <div
            data-testid="column-alert-detail"
            class="absolute right-0 z-10 w-64 space-y-2 rounded-2 border border-alpha-300 bg-alpha-50 p-2 text-xs shadow"
          >
            <For each={props.alerts()}>
              {(alert) => (
                <p>
                  {alert.message} — {alert.action}
                </p>
              )}
            </For>
          </div>
        </Show>
      </div>
    </Show>
  );
};

export default ColumnAlertBadge;
