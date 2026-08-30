import type { NostrCore } from "../../../core/solid/provider";
import NostrCoreDevtoolsBridge from "./NostrCoreDevtoolsBridge";

const RxNostrDevtools = (props: { core: NostrCore }) => (
  <NostrCoreDevtoolsBridge core={props.core} />
);

export default RxNostrDevtools;
