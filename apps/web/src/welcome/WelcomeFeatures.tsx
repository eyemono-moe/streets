import type { DeckAppearance } from "@streets/core/deck/deck";
import { type Component, For, type ParentComponent, Show } from "solid-js";
import { t } from "../i18n/locale";
import { displayHotkey, keymap } from "../keymap";
import PalettePicker from "../settings/PalettePicker";
import { type ColorScheme, paletteOf } from "../theme";
import { useDispatch } from "../ui-events";
import Button from "../ui/Button";
import SegmentedControl from "../ui/SegmentedControl";
import { GUIDE, GuideLink } from "./guide";
import NostrDiagram from "./NostrDiagram";
import ReorderDemo from "./ReorderDemo";

const REPOSITORY = "https://github.com/eyemono-moe/streets";

const COLUMN_KINDS = [
  "home",
  "notifications",
  "search",
  "lists",
  "channels",
  "users",
  "bookmarks",
  "articles",
] as const;

const schemes = (): { value: ColorScheme; label: string }[] => [
  { value: "light", label: t("welcome.features.custom.schemes.light") },
  { value: "dark", label: t("welcome.features.custom.schemes.dark") },
  { value: "system", label: t("welcome.features.custom.schemes.system") },
];

const OTHERS = ["timeTravel", "customEmoji", "pip"] as const;

const Section: ParentComponent<{ id: string; title: string; lead: string }> = (
  props,
) => (
  <section
    class="flex flex-col gap-4 border-primary border-t px-4 py-8"
    aria-labelledby={props.id}
  >
    <div class="flex flex-col gap-3">
      <h2 id={props.id} class="font-700 text-[22px] leading-snug">
        {props.title}
      </h2>
      <p class="c-secondary text-body leading-relaxed">{props.lead}</p>
    </div>
    {props.children}
  </section>
);

const Point: Component<{ title: string; children: string }> = (props) => (
  <div class="flex flex-col gap-1 border-accent-5 border-l-3 pl-3">
    <h3 class="font-600 text-body">{props.title}</h3>
    <p class="c-secondary text-caption leading-relaxed">{props.children}</p>
  </div>
);

const Card: ParentComponent<{ title: string }> = (props) => (
  <div class="flex flex-col gap-3 rounded-3 border border-primary p-3">
    <h3 class="font-600 text-caption">{props.title}</h3>
    {props.children}
  </div>
);

const Key: Component<{ children: string }> = (props) => (
  <kbd class="min-w-16 shrink-0 rounded-1.5 border border-control bg-secondary px-2 py-0.5 text-center font-mono text-caption">
    {props.children}
  </kbd>
);

const AboutLink: Component<{ page?: string; children: string }> = (props) => {
  const dispatch = useDispatch();
  return (
    <button
      type="button"
      class="cursor-pointer bg-transparent p-0 text-caption text-link"
      onClick={() => dispatch({ type: "deck/open-about", page: props.page })}
    >
      {props.children}
    </button>
  );
};

/**
 * 紹介のカラムの、始め方より下。Streets の大きな特徴を 3 つに分けて見せ、
 * 細かい機能は最後に 1 行ずつ並べる。
 */
const WelcomeFeatures: Component<{
  scheme: ColorScheme;
  appearance: DeckAppearance;
  /** キーボードの操作を見せる。狭い画面やタッチの端末では見せない。 */
  keyboard: boolean;
}> = (props) => {
  const dispatch = useDispatch();
  return (
    <>
      <Section
        id="welcome-nostr"
        title={t("welcome.features.nostr.title")}
        lead={t("welcome.features.nostr.lead")}
      >
        <NostrDiagram />
        <Point title={t("welcome.features.nostr.otherApps.title")}>
          {t("welcome.features.nostr.otherApps.body")}
        </Point>
        <Point title={t("welcome.features.nostr.findRelays.title")}>
          {t("welcome.features.nostr.findRelays.body")}
        </Point>
        <p class="text-caption">
          <GuideLink href={GUIDE}>
            {t("welcome.features.nostr.guide")}
          </GuideLink>
        </p>
      </Section>

      <Section
        id="welcome-columns"
        title={t("welcome.features.columns.title")}
        lead={t("welcome.features.columns.lead")}
      >
        <ul
          class="flex flex-wrap gap-2"
          aria-label={t("welcome.features.columns.kindsLabel")}
        >
          <For each={COLUMN_KINDS}>
            {(kind) => (
              <li class="rounded-full border border-control px-3 py-1 text-caption">
                {t(`welcome.features.columns.kinds.${kind}`)}
              </li>
            )}
          </For>
        </ul>
        <Button
          variant="primary"
          block
          icon="i-material-symbols:add-rounded"
          onClick={() =>
            dispatch({ type: "deck/open-panel", panel: "add-column" })
          }
        >
          {t("welcome.features.columns.add")}
        </Button>
        <ReorderDemo />
      </Section>

      <Section
        id="welcome-custom"
        title={t("welcome.features.custom.title")}
        lead={t("welcome.features.custom.lead")}
      >
        <Card title={t("welcome.features.custom.theme")}>
          <PalettePicker
            value={paletteOf(props.appearance)}
            onChange={(palette) =>
              dispatch({
                type: "deck/set-appearance",
                appearance: { accent: palette.accent, ui: palette.ui },
              })
            }
          />
          <SegmentedControl
            label={t("welcome.features.custom.brightness")}
            variant="secondary"
            block
            options={schemes()}
            value={props.scheme}
            onChange={(scheme) =>
              dispatch({ type: "deck/set-color-scheme", scheme })
            }
          />
        </Card>
        <Show when={props.keyboard}>
          <Card title={t("welcome.features.custom.keyboard.title")}>
            <dl class="flex flex-col gap-2 text-caption">
              <div class="flex items-center gap-3">
                <dt>
                  <Key>1–9</Key>
                </dt>
                <dd>{t("welcome.features.custom.keyboard.moveToColumn")}</dd>
              </div>
              <div class="flex items-center gap-3">
                <dt>
                  <Key>{displayHotkey(keymap().palette)}</Key>
                </dt>
                <dd>
                  <button
                    type="button"
                    class="cursor-pointer bg-transparent p-0 text-link"
                    onClick={() => dispatch({ type: "deck/open-palette" })}
                  >
                    {t("welcome.features.custom.keyboard.openPalette")}
                  </button>
                </dd>
              </div>
              <div class="flex items-center gap-3">
                <dt>
                  <Key>{t("welcome.features.custom.keyboard.settingsKey")}</Key>
                </dt>
                <dd>
                  <button
                    type="button"
                    class="cursor-pointer bg-transparent p-0 text-link"
                    onClick={() =>
                      dispatch({
                        type: "deck/open-settings",
                        setting: "shortcuts",
                      })
                    }
                  >
                    {t("welcome.features.custom.keyboard.changeKeys")}
                  </button>
                </dd>
              </div>
            </dl>
          </Card>
        </Show>
      </Section>

      <section
        class="flex flex-col gap-3 border-primary border-t px-4 py-8"
        aria-labelledby="welcome-others"
      >
        <h2 id="welcome-others" class="font-700 text-body">
          {t("welcome.features.others.title")}
        </h2>
        <ul class="flex flex-col gap-2 text-caption">
          <For each={OTHERS}>
            {(item) => <li>・{t(`welcome.features.others.${item}`)}</li>}
          </For>
        </ul>
      </section>

      <nav
        class="flex flex-wrap gap-x-4 gap-y-1 border-primary border-t px-4 py-6"
        aria-label={t("welcome.features.nav.label")}
      >
        <AboutLink>{t("welcome.features.nav.about")}</AboutLink>
        <AboutLink page="nips">{t("welcome.features.nav.nips")}</AboutLink>
        <a
          href={REPOSITORY}
          target="_blank"
          rel="noopener noreferrer"
          class="text-caption text-link"
        >
          GitHub
        </a>
        <AboutLink page="releases">
          {t("welcome.features.nav.releases")}
        </AboutLink>
      </nav>
    </>
  );
};

export default WelcomeFeatures;
