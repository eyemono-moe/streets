import { Show } from "solid-js";
import type { Component, JSX } from "solid-js";

/**
 * 診断値の表示条件をここに集める (ADR-0026)。ヘッダの `connections` /
 * `peak-connections` / `optimistic-insert-ms` / `unrequested-relays` と、
 * `DeckColumn` の `deck-column-phase` / `deck-column-incomplete` は
 * どちらも「行動できない値」で、開発者モードが有効なときだけ描画する ——
 * 中身が違う 2 箇所に同じ `<Show when={developerMode()}>` を書き散らすと、
 * 将来 3 箇所目が増えたときに条件を書き忘れる余地ができる。ここに 1 つに
 * 集めることで、ADR-0026 の判定 (「開発者モードが有効か」) がコードベース
 * のどこにも重複しない。
 *
 * `ColumnAlertBadge` (同じディレクトリ) はこれと対になる —— あちらは
 * 「常に見せる」側で、`developerMode` を一切見ない。
 */
const DiagnosticsPanel: Component<{
  visible: () => boolean;
  children: JSX.Element;
}> = (props) => <Show when={props.visible()}>{props.children}</Show>;

export default DiagnosticsPanel;
