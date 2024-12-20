import { A } from "@solidjs/router";
import type { Component } from "solid-js";
import BasicLayout from "../features/Settings/components/BasicLayout";
import { useI18n } from "../i18n";

const index: Component = () => {
  const t = useI18n();

  return (
    <BasicLayout title={t("settings.title")}>
      <div class="grid h-full grid-rows-[minmax(0,1fr)_auto]">
        <div class="space-y-4">
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
          <ul class="b-1 divide-y overflow-hidden rounded-2">
            <li>
              <A
                class="inline-flex w-full items-center gap-2 px-2 py-1 hover:bg-alpha-hover"
                href="/settings/about"
              >
                <div class="i-streets:logo aspect-square h-1lh w-auto" />
                {t("settings.about.title")}
                <div class="i-material-symbols:chevron-right-rounded ml-auto aspect-square h-1lh w-auto" />
              </A>
            </li>
          </ul>
        </div>
      </div>
    </BasicLayout>
  );
};

export default index;
