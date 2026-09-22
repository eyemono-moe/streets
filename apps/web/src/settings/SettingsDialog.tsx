import type { DeckAppearance } from "@streets/core/deck/deck";
import type { ColorScheme } from "@streets/core/settings/color-scheme";
import { type Component, createEffect, createSignal, on } from "solid-js";
import { Mediates, type UiEvent, useDispatch } from "../ui-events";
import PagedDialog, { type DialogPage } from "../ui/PagedDialog";
import AccountSettings from "./AccountSettings";
import DisplaySettings from "./DisplaySettings";
import MediaSettings from "./MediaSettings";
import MuteSettings from "./MuteSettings";
import { useProfileEdit } from "./ProfileMediator";
import RelaySettings from "./RelaySettings";
import SearchSettings from "./SearchSettings";

/**
 * 設定。デッキの上に開くダイアログで、左（狭い画面では上）にページの一覧を置く。
 */
const SettingsDialog: Component<{
  open: boolean;
  /** 狭い画面では、ページの一覧を横に並べて全面に出す。 */
  wide: boolean;
  scheme: ColorScheme;
  appearance: DeckAppearance;
  writeProgress: boolean;
  /** 不具合の報告を送るか（この端末の設定）。 */
  errorReport: boolean;
  /** 開いたときに出すページ。 */
  initialPage?: string;
}> = (props) => {
  const dispatch = useDispatch();
  // 一覧の先頭（アカウント）から開く。どこから開いても同じ場所で始まる。
  const [page, setPage] = createSignal(props.initialPage ?? "account");
  // プロフィールを書きかけのまま閉じようとしたら、そのページを見せる。
  const profileEdit = useProfileEdit();
  createEffect(
    on(
      () => profileEdit?.attention() ?? 0,
      (count) => {
        if (count > 0) setPage("account");
      },
      { defer: true },
    ),
  );

  const pages: DialogPage[] = [
    {
      value: "account",
      label: "アカウント",
      icon: "i-material-symbols:person-outline-rounded",
      title: "アカウント",
      content: () => <AccountSettings />,
    },
    {
      value: "relays",
      label: "リレー",
      icon: "i-material-symbols:globe",
      title: "リレー",
      content: () => <RelaySettings />,
    },

    {
      value: "media",
      label: "画像",
      icon: "i-material-symbols:image-outline-rounded",
      title: "画像",
      content: () => <MediaSettings />,
    },
    {
      value: "search",
      label: "検索",
      icon: "i-material-symbols:search-rounded",
      title: "検索",
      description: "言葉での検索を、どのリレーへ問い合わせるかを決めます。",
      content: () => <SearchSettings />,
    },
    {
      value: "mute",
      label: "ミュート",
      icon: "i-material-symbols:volume-off-outline-rounded",
      title: "ミュート",
      content: () => <MuteSettings />,
    },
    {
      value: "display",
      label: "表示",
      icon: "i-material-symbols:visibility-outline-rounded",
      title: "表示",
      content: () => (
        <DisplaySettings
          scheme={props.scheme}
          appearance={props.appearance}
          writeProgress={props.writeProgress}
          errorReport={props.errorReport}
        />
      ),
    },
  ];

  // 設定はカラムではないので、重ねる先が無い。人やノートを開く操作は、デッキに
  // カラムとして足してからダイアログを閉じ、足したカラムを見せる。
  const handle = (event: UiEvent): boolean => {
    if (event.type !== "stack/open") return false;
    dispatch({ type: "deck/add-column", column: event.column });
    dispatch({ type: "deck/close-settings" });
    return true;
  };

  return (
    <Mediates handle={handle}>
      <PagedDialog
        open={props.open}
        wide={props.wide}
        title="設定"
        description="アカウントと、この端末の表示を設定します。"
        pages={pages}
        page={page()}
        onPageChange={setPage}
        onClose={() => dispatch({ type: "deck/close-settings" })}
      />
    </Mediates>
  );
};

export default SettingsDialog;
