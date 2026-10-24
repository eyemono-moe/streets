import type { Component } from "solid-js";
import { t } from "../i18n/locale";

/** 相手が自分をフォローしていることの印。名前の横に置く。 */
const FollowsYouBadge: Component = () => (
  <span class="c-secondary shrink-0 whitespace-nowrap rounded-full bg-secondary px-2 py-0.5 text-caption">
    {t("profile.followsYou")}
  </span>
);

export default FollowsYouBadge;
