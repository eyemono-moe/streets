import { TanStackDevtools } from "@tanstack/solid-devtools";
import { SolidQueryDevtoolsPanel } from "@tanstack/solid-query-devtools";
import NostrCoreDevtoolsPanel from "./NostrCoreDevtoolsPanel";
import { NOSTR_CORE_DEVTOOLS_PLUGIN_ID } from "./nostr-core-devtools-client";

const AppDevtools = () => (
  <>
    <TanStackDevtools
      plugins={[
        {
          name: "TanStack Query",
          render: <SolidQueryDevtoolsPanel />,
        },
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

export default AppDevtools;
