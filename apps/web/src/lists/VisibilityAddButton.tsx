import type { ItemVisibility } from "@streets/core/nostr/private-tags";
import type { Component } from "solid-js";
import { t } from "../i18n/locale";
import SplitButton from "../ui/SplitButton";

/**
 * 公開範囲を選んで足す「追加」。押せば選んでいる公開範囲で足し、▾ から選び直す。
 * 足す前に別の欄で選ばせると、何の公開範囲かが「追加」と結び付いて見えない。
 * 非公開を扱えない署名器では、非公開を選べなくして公開で足す。
 */
const VisibilityAddButton: Component<{
  value: ItemVisibility;
  privateReady: boolean;
  onChange: (value: ItemVisibility) => void;
  type?: "button" | "submit";
  disabled?: boolean;
  onClick?: () => void;
  /** Storybook でメニューを開いた姿を並べるため。 */
  defaultOpen?: boolean;
}> = (props) => {
  const visibility = (): ItemVisibility =>
    props.privateReady ? props.value : "public";
  return (
    <SplitButton
      type={props.type}
      disabled={props.disabled}
      onClick={props.onClick}
      defaultOpen={props.defaultOpen}
      icon={
        visibility() === "public"
          ? "i-material-symbols:public-rounded"
          : "i-material-symbols:add-rounded"
      }
      menuLabel={t("lists.visibility.add.menuLabel")}
      value={visibility()}
      onChange={props.onChange}
      options={[
        {
          value: "private",
          label: t("lists.visibility.add.private"),
          icon: "i-material-symbols:lock-outline-rounded",
          description: t("lists.visibility.add.privateDescription"),
          disabled: !props.privateReady,
          hint: t("lists.visibility.add.privateUnavailable"),
        },
        {
          value: "public",
          label: t("lists.visibility.add.public"),
          icon: "i-material-symbols:public-rounded",
          description: t("lists.visibility.add.publicDescription"),
        },
      ]}
    >
      {visibility() === "public"
        ? t("lists.visibility.add.public")
        : t("lists.visibility.add.label")}
    </SplitButton>
  );
};

export default VisibilityAddButton;
