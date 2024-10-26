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
              content: { type: "timeline" },
              size: "medium",
            })
          }
        >
          <div class="i-material-symbols:home-outline-rounded c-secondary parent-hover:c-accent-5 aspect-square h-8 w-auto transition-color duration-100" />
          <div class="text-caption">{t("column.timeline.title")}</div>
        </button>
        <button
          class="parent flex appearance-none flex-col items-center bg-transparent p-1"
          type="button"
          onClick={() => navigate("/add-column/user")}
        >
          <div class="i-material-symbols:person-outline-rounded c-secondary parent-hover:c-accent-5 aspect-square h-8 w-auto transition-color duration-100" />
          <div class="text-caption">{t("column.profile.title")}</div>
        </button>
        <button
          class="parent flex appearance-none flex-col items-center bg-transparent p-1"
          type="button"
          onClick={() => {
            addColumn({
              content: { type: "search", query: "" },
              size: "medium",
            });
          }}
        >
          <div class="i-material-symbols:search-rounded c-secondary parent-hover:c-accent-5 aspect-square h-8 w-auto transition-color duration-100" />
          <div class="text-caption">{t("column.search.title")}</div>
        </button>
        <button
          class="parent flex appearance-none flex-col items-center bg-transparent p-1"
          type="button"
          onClick={() =>
            addColumn({ content: { type: "notifications" }, size: "medium" })
          }
        >
          <div class="i-material-symbols:notifications-outline-rounded c-secondary parent-hover:c-accent-5 aspect-square h-8 w-auto transition-color duration-100" />
          <div class="text-caption">{t("column.notifications.title")}</div>
        </button>
        <button
          class="parent flex appearance-none flex-col items-center bg-transparent p-1"
          type="button"
          onClick={() => navigate("/add-column/followees")}
        >
          <div class="i-material-symbols:person-check-outline-rounded c-secondary parent-hover:c-accent-5 aspect-square h-8 w-auto transition-color duration-100" />
          <div class="text-caption">{t("column.followees.title")}</div>
        </button>
        <button
          class="parent flex appearance-none flex-col items-center bg-transparent p-1"
          type="button"
          onClick={() => navigate("/add-column/followers")}
        >
          <div class="i-material-symbols:group-outline-rounded c-secondary parent-hover:c-accent-5 aspect-square h-8 w-auto transition-color duration-100" />
          <div class="text-caption">{t("column.followers.title")}</div>
        </button>
        <button
          class="parent flex appearance-none flex-col items-center bg-transparent p-1"
          type="button"
          onClick={() => navigate("/add-column/reactions")}
        >
          <div class="i-material-symbols:favorite-outline-rounded c-secondary parent-hover:c-accent-5 aspect-square h-8 w-auto transition-color duration-100" />
          <div class="text-caption">{t("column.reactions.title")}</div>
        </button>
        {/* <button
          class="parent flex appearance-none flex-col items-center bg-transparent p-1"
          type="button"
        >
          <div class="i-material-symbols:bookmark-outline-rounded c-secondary parent-hover:c-accent-5 aspect-square h-8 w-auto transition-color duration-100" />
          <div class="text-caption">{t("column.bookmarks.title")}</div>
        </button> */}
        {/* <button
          class="parent flex appearance-none flex-col items-center bg-transparent p-1"
          type="button"
        >
          <div class="c-secondary parent-hover:c-accent-5 aspect-square h-8 w-auto i-material-symbols:list-alt-outline-rounded transition-color duration-100" />
          <div class="text-caption">{t("column.lists.title")}</div>
        </button> */}
        {/* <button
          class="parent flex appearance-none flex-col items-center bg-transparent p-1"
          type="button"
        >
          <div class="i-material-symbols:trending-up-rounded c-secondary parent-hover:c-accent-5 aspect-square h-8 w-auto transition-color duration-100" />
          <div class="text-caption">{t("column.trends.title")}</div>
        </button> */}
      </div>
    </BasicLayout>
  );
};

export default addColumn;
