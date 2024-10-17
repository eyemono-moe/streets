import { useNavigate } from "@solidjs/router";
import type { Component } from "solid-js";
import { useDeck } from "../features/Column/context/deck";
import BasicLayout from "../features/Settings/components/BasicLayout";
import { useI18n } from "../i18n";

const addColumn: Component = () => {
  const t = useI18n();

  const [, { addColumn }] = useDeck();
  const navigate = useNavigate();

  return (
    <BasicLayout title={t("addColumn.title")}>
      <div class="grid grid-cols-4 gap-x-0 gap-y-2 p-2">
        <button
          class="parent flex appearance-none flex-col items-center bg-transparent p-1"
          type="button"
          onClick={() =>
            addColumn({
              type: "timeline",
              size: "medium",
            })
          }
        >
          <div class="i-material-symbols:home-outline-rounded c-zinc-7 parent-hover:c-purple-8 aspect-square h-8 w-auto transition-color duration-100" />
          <div class="text-3.5">{t("column.timeline.title")}</div>
        </button>
        <button
          class="parent flex appearance-none flex-col items-center bg-transparent p-1"
          type="button"
          onClick={() => navigate("/add-column/user")}
        >
          <div class="i-material-symbols:person-outline-rounded c-zinc-7 parent-hover:c-purple-8 aspect-square h-8 w-auto transition-color duration-100" />
          <div class="text-3.5">{t("column.profile.title")}</div>
        </button>
        <button
          class="parent flex appearance-none flex-col items-center bg-transparent p-1"
          type="button"
        >
          <div class="i-material-symbols:search-rounded c-zinc-7 parent-hover:c-purple-8 aspect-square h-8 w-auto transition-color duration-100" />
          <div class="text-3.5">{t("column.search.title")}</div>
        </button>
        <button
          class="parent flex appearance-none flex-col items-center bg-transparent p-1"
          type="button"
          onClick={() => addColumn({ type: "notifications", size: "medium" })}
        >
          <div class="i-material-symbols:notifications-outline-rounded c-zinc-7 parent-hover:c-purple-8 aspect-square h-8 w-auto transition-color duration-100" />
          <div class="text-3.5">{t("column.notifications.title")}</div>
        </button>
        <button
          class="parent flex appearance-none flex-col items-center bg-transparent p-1"
          type="button"
          onClick={() => navigate("/add-column/followees")}
        >
          <div class="i-material-symbols:person-check-outline-rounded c-zinc-7 parent-hover:c-purple-8 aspect-square h-8 w-auto transition-color duration-100" />
          <div class="text-3.5">{t("column.followees.title")}</div>
        </button>
        <button
          class="parent flex appearance-none flex-col items-center bg-transparent p-1"
          type="button"
          onClick={() => navigate("/add-column/followers")}
        >
          <div class="i-material-symbols:group-outline-rounded c-zinc-7 parent-hover:c-purple-8 aspect-square h-8 w-auto transition-color duration-100" />
          <div class="text-3.5">{t("column.followers.title")}</div>
        </button>
        <button
          class="parent flex appearance-none flex-col items-center bg-transparent p-1"
          type="button"
          onClick={() => navigate("/add-column/reactions")}
        >
          <div class="i-material-symbols:favorite-outline-rounded c-zinc-7 parent-hover:c-purple-8 aspect-square h-8 w-auto transition-color duration-100" />
          <div class="text-3.5">{t("column.reactions.title")}</div>
        </button>
        {/* <button
          class="parent flex appearance-none flex-col items-center bg-transparent p-1"
          type="button"
        >
          <div class="i-material-symbols:bookmark-outline-rounded c-zinc-7 parent-hover:c-purple-8 aspect-square h-8 w-auto transition-color duration-100" />
          <div class="text-3.5">{t("column.bookmarks.title")}</div>
        </button> */}
        {/* <button
          class="parent flex appearance-none flex-col items-center bg-transparent p-1"
          type="button"
        >
          <div class="c-zinc-7 parent-hover:c-purple-8 aspect-square h-8 w-auto i-material-symbols:list-alt-outline-rounded transition-color duration-100" />
          <div class="text-3.5">{t("column.lists.title")}</div>
        </button> */}
        {/* <button
          class="parent flex appearance-none flex-col items-center bg-transparent p-1"
          type="button"
        >
          <div class="i-material-symbols:trending-up-rounded c-zinc-7 parent-hover:c-purple-8 aspect-square h-8 w-auto transition-color duration-100" />
          <div class="text-3.5">{t("column.trends.title")}</div>
        </button> */}
      </div>
    </BasicLayout>
  );
};

export default addColumn;
