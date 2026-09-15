import type { JSX, ParentComponent } from "solid-js";

type SettingsPageProps = {
  title: string;
  description: string;
};

/** すべての設定ページで見出し位置と本文幅を揃える。 */
const SettingsPage: ParentComponent<SettingsPageProps> = (
  props,
): JSX.Element => (
  <section>
    <header class="pr-10">
      <h2 class="font-700 text-h3">{props.title}</h2>
      <p class="c-secondary mt-1 text-caption">{props.description}</p>
    </header>
    {props.children}
  </section>
);

export default SettingsPage;
