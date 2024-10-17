import type { Component } from "solid-js";
import { useI18n } from "../../../i18n";
import Button from "../../../shared/components/UI/Button";
import { showLoginModal } from "../../../shared/libs/nostrLogin";

const NeedLoginPlaceholder: Component<{
  message?: string;
}> = (props) => {
  const t = useI18n();

  return (
    <div class="flex h-full w-full flex-col items-center justify-center gap-2">
      <div>{props.message}</div>
      <Button onClick={showLoginModal}>{t("login")}</Button>
    </div>
  );
};

export default NeedLoginPlaceholder;
