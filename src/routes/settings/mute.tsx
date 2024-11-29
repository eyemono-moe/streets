import type { Component } from "solid-js";
import MuteSettings from "../../features/Mute/components/MuteSettings";
import BasicLayout from "../../features/Settings/components/BasicLayout";
import { useI18n } from "../../i18n";

const mute: Component = () => {
  const t = useI18n();

  return (
    <BasicLayout title={t("settings.mute.title")} backTo="/settings">
      <MuteSettings />
    </BasicLayout>
  );
};

export default mute;
