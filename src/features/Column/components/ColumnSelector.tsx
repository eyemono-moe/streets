import type { Component } from "solid-js";
import { useI18n } from "../../../i18n";

const ColumnSelector: Component = () => {
  const t = useI18n();

  return (
    <div class="grid grid-cols-4 gap-1 p-2">
      <button
        class="flex appearance-none flex-col items-center bg-transparent p-1"
        type="button"
      >
        <div class="i-material-symbols:home-outline-rounded c-zinc-7 aspect-square h-12 w-auto" />
        <div>{t("column.timeline.title")}</div>
      </button>
      <button
        class="flex appearance-none flex-col items-center bg-transparent p-1"
        type="button"
      >
        <div class="i-material-symbols:person-outline-rounded c-zinc-7 aspect-square h-12 w-auto" />
        <div>{t("column.profile.title")}</div>
      </button>
      <button
        class="flex appearance-none flex-col items-center bg-transparent p-1"
        type="button"
      >
        <div class="i-material-symbols:search-rounded c-zinc-7 aspect-square h-12 w-auto" />
        <div>{t("column.search.title")}</div>
      </button>
      <button
        class="flex appearance-none flex-col items-center bg-transparent p-1"
        type="button"
      >
        <div class="i-material-symbols:notifications-outline-rounded c-zinc-7 aspect-square h-12 w-auto" />
        <div>{t("column.notifications.title")}</div>
      </button>
      <button
        class="flex appearance-none flex-col items-center bg-transparent p-1"
        type="button"
      >
        <div class="i-material-symbols:person-check-outline-rounded c-zinc-7 aspect-square h-12 w-auto" />
        <div>{t("column.followees.title")}</div>
      </button>
      <button
        class="flex appearance-none flex-col items-center bg-transparent p-1"
        type="button"
      >
        <div class="i-material-symbols:group-outline-rounded c-zinc-7 aspect-square h-12 w-auto" />
        <div>{t("column.followers.title")}</div>
      </button>
      <button
        class="flex appearance-none flex-col items-center bg-transparent p-1"
        type="button"
      >
        <div class="i-material-symbols:favorite-outline-rounded c-zinc-7 aspect-square h-12 w-auto" />
        <div>{t("column.reactions.title")}</div>
      </button>
      <button
        class="flex appearance-none flex-col items-center bg-transparent p-1"
        type="button"
      >
        <div class="i-material-symbols:bookmark-outline-rounded c-zinc-7 aspect-square h-12 w-auto" />
        <div>{t("column.bookmarks.title")}</div>
      </button>
      <button
        class="flex appearance-none flex-col items-center bg-transparent p-1"
        type="button"
      >
        <div class="c-zinc-7 aspect-square h-12 w-auto i-material-symbols:list-alt-outline-rounded" />
        <div>{t("column.lists.title")}</div>
      </button>
      <button
        class="flex appearance-none flex-col items-center bg-transparent p-1"
        type="button"
      >
        <div class="i-material-symbols:trending-up-rounded c-zinc-7 aspect-square h-12 w-auto" />
        <div>{t("column.trends.title")}</div>
      </button>
    </div>
  );
};

export default ColumnSelector;
