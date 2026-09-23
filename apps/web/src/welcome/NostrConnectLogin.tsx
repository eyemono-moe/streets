import { type Component, createSignal, onCleanup } from "solid-js";
import { type ConnectAttempt, ConnectCancelledError } from "../session";
import NostrConnectView, { type NostrConnectStatus } from "./NostrConnectView";

/** 出ている間だけ署名器からの接続を待つ。閉じたら待つのをやめる。 */
const NostrConnectLogin: Component<{ start: () => ConnectAttempt }> = (
  props,
) => {
  let current: ConnectAttempt | undefined;
  const [status, setStatus] = createSignal<NostrConnectStatus>({
    phase: "failed",
  });
  const begin = () => {
    current?.cancel();
    const attempt = props.start();
    current = attempt;
    setStatus({ phase: "waiting", uri: attempt.uri });
    attempt.done.catch((error: unknown) => {
      if (current !== attempt || error instanceof ConnectCancelledError) return;
      setStatus({ phase: "failed" });
    });
  };
  begin();
  onCleanup(() => current?.cancel());
  return <NostrConnectView status={status()} onRetry={begin} />;
};

export default NostrConnectLogin;
