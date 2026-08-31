import { Show } from "solid-js";
import type { Component, JSX } from "solid-js";

/**
 * 診断値の表示条件を 1 箇所に集める —— 書き散らすと増えたとき書き忘れる。
 * `ColumnAlertBadge` はこれと対になる「常に見せる」側。
 */
const DiagnosticsPanel: Component<{
  visible: () => boolean;
  children: JSX.Element;
}> = (props) => <Show when={props.visible()}>{props.children}</Show>;

export default DiagnosticsPanel;
