import type { Component } from "solid-js";
import BasicLayout from "../../features/Settings/components/BasicLayout";
import ProfileSettings from "../../features/User/components/ProfileSettings";
import { useI18n } from "../../i18n";

const profile: Component = () => {
  const t = useI18n();

  return (
    <BasicLayout title={t("settings.profile.title")} backTo="/settings">
      <ProfileSettings />
    </BasicLayout>
  );
};

export default profile;
