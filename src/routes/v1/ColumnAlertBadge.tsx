import { For, Show, createSignal } from "solid-js";
import type { Component } from "solid-js";
import type { ColumnAlert } from "../../core/deck/column-alerts";

/**
 * カラムに起きた「ユーザーが行動できる異常」の入口 (ADR-0026)。判定は
 * `columnAlerts` (Task 2, ユニットテスト済み) に集約済みで、ここは結果を
 * 出すだけ —— 何が行動可能かの判断をこのコンポーネントに持ち込まない。
 *
 * **`developerMode` を見ない。** `DiagnosticsPanel` (同じディレクトリ) が
 * 診断値を開発者モードの背後に置くのと対照的に、こちらは常時描画する ——
 * ADR-0026 が割いた 2 分類 (行動できる異常は常に見せる／診断値は開発者
 * モードの背後) をここで再び 1 つに畳むと、常に見せるべきものまで隠れる。
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
