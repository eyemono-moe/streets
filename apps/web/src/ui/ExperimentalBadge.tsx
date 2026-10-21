import type { Component } from "solid-js";
import { t } from "../i18n/locale";

/**
 * まだ試している機能の印。項目の名前の横に置く。思ったとおりに効かないことが
 * あると、触る前に分かるようにする。
 */
const ExperimentalBadge: Component = () => (
  <span class="c-secondary shrink-0 whitespace-nowrap rounded-full border border-control px-2 py-0.5 text-caption">
    {t("ui.experimental")}
  </span>
);

export default ExperimentalBadge;
