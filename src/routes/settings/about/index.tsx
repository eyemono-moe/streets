import { A } from "@solidjs/router";
import { type Component, For } from "solid-js";
import LogoDark from "../../../assets/streets_logo_full_dark.min.svg";
import LogoLight from "../../../assets/streets_logo_full_light.min.svg";
import { useDeck } from "../../../features/Column/context/deck";
import BasicLayout from "../../../features/Settings/components/BasicLayout";
import ProfileRow from "../../../features/User/components/ProfileRow";
import { useI18n } from "../../../i18n";

const authors: string[] = [
  "dbe6fc932b40d3f322f3ce716b30b4e58737a5a1110908609565fb146f55f44a",
];

const index: Component = () => {
  const t = useI18n();

  const [, { addColumn }] = useDeck();
  const handleAddColumn = (pubkey: string) => {
    addColumn({
      content: {
        type: "user",
        pubkey,
      },
      size: "medium",
    });
  };

  const commitSha = import.meta.env.DEV
    ? "dev"
    : import.meta.env.VITE_VERCEL_GIT_COMMIT_SHA?.slice(0, 7);

  return (
    <BasicLayout title={t("settings.about.title")} backTo="/settings">
      <div class="space-y-4">
        <div class="space-y-2">
          <picture>
            <source srcset={LogoDark} media="(prefers-color-scheme: dark)" />
            <img
              src={LogoLight}
              alt="streets logo"
              class="mx-auto w-60 max-w-full"
            />
          </picture>
          <p class="p-2">{t("settings.about.about")}</p>
          <ul class="c-secondary text-caption">
            <li>build version: {commitSha}</li>
            <li>build date: {BUILD_DATE}</li>
          </ul>
          <h4 class="flex items-center gap-1 font-500 text-h3">
            {t("settings.about.author")}
          </h4>
          <ul class="b-1 h-full divide-y overflow-y-auto overflow-x-hidden rounded-2">
            <For each={authors}>
              {(author) => (
                <li>
                  <ProfileRow
                    pubkey={author}
                    showFollowButton
                    onClick={() => handleAddColumn(author)}
                  />
                </li>
              )}
            </For>
          </ul>
          <div>
            <a
              href="https://github.com/eyemono-moe/streets/graphs/contributors"
              target="_blank"
              rel="noopener noreferrer"
              class="text-link"
            >
              {t("settings.about.contributors")}
            </a>
          </div>
        </div>
        <ul class="space-y-1">
          <li>
            <a
              href="https://github.com/eyemono-moe/strands"
              target="_blank"
              rel="noopener noreferrer"
              class="inline-flex gap-1 text-link"
            >
              {t("settings.about.source")}
              <div class="i-mdi:github c-primary aspect-square h-1lh w-auto" />
            </a>
          </li>
          <li>
            <A href="/settings/about/privacy" class="text-link">
              {t("settings.about.privacy")}
            </A>
          </li>
          <li>
            <a
              href="https://forms.gle/WHiCG3X8Q596nTDW9"
              target="_blank"
              rel="noopener noreferrer"
              class="text-link"
            >
              {t("settings.about.bugReport")}
            </a>
          </li>
        </ul>
      </div>
    </BasicLayout>
  );
};

export default index;
