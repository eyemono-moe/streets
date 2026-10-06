import type { ReadLayer } from "@streets/core/read/read-layer";
import type { RelayTraffic } from "@streets/core/relay/relay-traffic";
import { TanStackDevtools } from "@tanstack/solid-devtools";
import type { Component } from "solid-js";
import ReadLayerPanel from "./ReadLayerPanel";
import RelayTrafficPanel from "./RelayTrafficPanel";

const AppDevtools: Component<{
  readLayer: ReadLayer;
  relayTraffic: RelayTraffic | undefined;
}> = (props) => (
  // 本番ビルドでは devtools-vite がこの要素を取り除くので、式が空にならないよう包む。
  <>
    <TanStackDevtools
      plugins={[
        {
          name: "Streets Core",
          render: <ReadLayerPanel readLayer={props.readLayer} />,
          defaultOpen: true,
        },
        ...(props.relayTraffic
          ? [
              {
                name: "Relays",
                render: <RelayTrafficPanel traffic={props.relayTraffic} />,
              },
            ]
          : []),
      ]}
    />
  </>
);

export default AppDevtools;
