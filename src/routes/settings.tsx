import { A } from "@solidjs/router";
import type { Component } from "solid-js";
import BasicLayout from "../features/Settings/components/BasicLayout";
import { useI18n } from "../i18n";

const index: Component = () => {
  const t = useI18n();

  return (
    <BasicLayout title={t("settings.title")}>
      <ul class="b-1 divide-y overflow-hidden rounded-2">
        <li>
          <A
            class="inline-flex w-full items-center gap-2 px-2 py-1 hover:bg-zinc-1"
            href="/settings/relay"
          >
            <div class="i-material-symbols:globe aspect-square h-1lh w-auto" />
            {t("settings.relay.title")}
            <div class="i-material-symbols:chevron-right-rounded ml-auto aspect-square h-1lh w-auto" />
          </A>
        </li>
      </ul>
    </BasicLayout>
  );
};

export default index;
