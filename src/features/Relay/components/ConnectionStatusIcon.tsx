import { type Component, createMemo } from "solid-js";
import { useRxNostr } from "../../../context/rxNostr";
import { useI18n } from "../../../i18n";
import "../../../assets/dialog.css";
import Tooltip from "../../../shared/components/Tooltip";

const ConnectionStatusIcon: Component<{ relay: string }> = (props) => {
  const t = useI18n();

  const { connectionState } = useRxNostr();

  const state = createMemo(
    () => connectionState[props.relay] ?? "not-connected",
  );

  const statusMessage = createMemo(() => {
    switch (state()) {
      case "connected":
        return t("relayConnectionStatus.connected");
      case "connecting":
        return t("relayConnectionStatus.connecting");
      case "dormant":
        return t("relayConnectionStatus.dormant");
      case "error":
        return t("relayConnectionStatus.error");
      case "initialized":
        return t("relayConnectionStatus.initialized");
      case "not-connected":
        return t("relayConnectionStatus.not-connected");
      case "rejected":
        return t("relayConnectionStatus.rejected");
      case "retrying":
        return t("relayConnectionStatus.retrying");
      case "terminated":
        return t("relayConnectionStatus.terminated");
      case "waiting-for-retrying":
        return t("relayConnectionStatus.waiting-for-retrying");
      default:
        return t("relayConnectionStatus.unknown");
    }
  });

  const statusIcon = createMemo(() => {
    switch (state()) {
      case "connected":
        return "i-material-symbols:check-circle-rounded c-green";
      case "connecting":
        return "i-material-symbols:arrow-circle-up-rounded c-yellow";
      case "retrying":
      case "waiting-for-retrying":
        return "i-material-symbols:replay-circle-filled-rounded c-yellow";
      case "dormant":
      case "terminated":
        return "i-material-symbols:pause-circle-rounded c-gray";
      case "error":
      case "rejected":
        return "i-material-symbols:error-circle-rounded c-red";
      case "initialized":
        return "i-material-symbols:build-circle-rounded c-blue";
      case "not-connected":
        return "i-material-symbols:circle c-gray";
      default:
        return "i-material-symbols:help-rounded c-gray";
    }
  });

  return (
    <Tooltip content={statusMessage()}>
      <div class={`${statusIcon()} aspect-square h-1lh w-auto`} />
    </Tooltip>
  );
};

export default ConnectionStatusIcon;
