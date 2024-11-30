import { A } from "@solidjs/router";
import type { Component } from "solid-js";
import LogoDark from "../assets/streets_logo_full_dark.min.svg";
import LogoLight from "../assets/streets_logo_full_light.min.svg";
import { useOpenUserColumn } from "../features/Column/libs/useOpenColumn";
import BasicLayout from "../features/Settings/components/BasicLayout";
import { useI18n } from "../i18n";

const index: Component = () => {
  const t = useI18n();

  const openUserColumn = useOpenUserColumn();

  return (
    <BasicLayout title={t("settings.title")}>
      <div class="grid h-full grid-rows-[minmax(0,1fr)_auto]">
        <div>
          <ul class="b-1 divide-y overflow-hidden rounded-2">
            <li>
              <A
                class="inline-flex w-full items-center gap-2 px-2 py-1 hover:bg-alpha-hover"
                href="/settings/profile"
              >
                <div class="i-material-symbols:manage-accounts-rounded aspect-square h-1lh w-auto" />
                {t("settings.profile.title")}
                <div class="i-material-symbols:chevron-right-rounded ml-auto aspect-square h-1lh w-auto" />
              </A>
            </li>
            <li>
              <A
                class="inline-flex w-full items-center gap-2 px-2 py-1 hover:bg-alpha-hover"
                href="/settings/mute"
              >
                <div class="i-material-symbols:visibility-off-outline-rounded aspect-square h-1lh w-auto" />
                {t("settings.mute.title")}
                <div class="i-material-symbols:chevron-right-rounded ml-auto aspect-square h-1lh w-auto" />
              </A>
            </li>
            <li>
              <A
                class="inline-flex w-full items-center gap-2 px-2 py-1 hover:bg-alpha-hover"
                href="/settings/relay"
              >
                <div class="i-material-symbols:globe aspect-square h-1lh w-auto" />
                {t("settings.relay.title")}
                <div class="i-material-symbols:chevron-right-rounded ml-auto aspect-square h-1lh w-auto" />
              </A>
            </li>
            <li>
              <A
                class="inline-flex w-full items-center gap-2 px-2 py-1 hover:bg-alpha-hover"
                href="/settings/display"
              >
                <div class="i-material-symbols:visibility-outline-rounded aspect-square h-1lh w-auto" />
                {t("settings.display.title")}
                <div class="i-material-symbols:chevron-right-rounded ml-auto aspect-square h-1lh w-auto" />
              </A>
            </li>
            <li>
              <A
                class="inline-flex w-full items-center gap-2 px-2 py-1 hover:bg-alpha-hover"
                href="/settings/file"
              >
                <div class="i-material-symbols:perm-media-outline-rounded aspect-square h-1lh w-auto" />
                {t("settings.file.title")}
                <div class="i-material-symbols:chevron-right-rounded ml-auto aspect-square h-1lh w-auto" />
              </A>
            </li>
          </ul>
        </div>
        <div class="c-secondary flex flex-col items-center gap-1 text-caption">
          <picture>
            <source srcset={LogoDark} media="(prefers-color-scheme: dark)" />
            <img src={LogoLight} alt="streets logo" class="w-40 max-w-full" />
          </picture>
          <div>
            created by{" "}
            <button
              class="appearance-none bg-transparent text-link"
              onClick={() =>
                openUserColumn(
                  "dbe6fc932b40d3f322f3ce716b30b4e58737a5a1110908609565fb146f55f44a",
                )
              }
              type="button"
            >
              eyemono.moe
            </button>
          </div>
          <div class="flex items-center justify-center gap-2">
            build:{import.meta.env.VITE_BUILD_SHA}
            <a
              href="https://github.com/eyemono-moe/strands"
              target="_blank"
              rel="noopener noreferrer"
            >
              <div class="i-mdi:github m--0.125lh aspect-square h-1.25lh w-auto" />
            </a>
          </div>
        </div>
      </div>
    </BasicLayout>
  );
};

export default index;
