import { TanStackDevtools } from "@tanstack/solid-devtools";
import type { NostrCore } from "../../../core/solid/provider";
import NostrCoreDevtoolsBridge from "./NostrCoreDevtoolsBridge";
import NostrCoreDevtoolsPanel from "./NostrCoreDevtoolsPanel";
import { NOSTR_CORE_DEVTOOLS_PLUGIN_ID } from "./nostr-core-devtools-client";

const RxNostrDevtools = (props: { core: NostrCore }) => (
  <>
    <NostrCoreDevtoolsBridge core={props.core} />
    <TanStackDevtools
      plugins={[
        {
          id: NOSTR_CORE_DEVTOOLS_PLUGIN_ID,
          name: "Nostr Core",
          render: <NostrCoreDevtoolsPanel />,
          defaultOpen: true,
        },
      ]}
    />
  </>
);

export default RxNostrDevtools;
