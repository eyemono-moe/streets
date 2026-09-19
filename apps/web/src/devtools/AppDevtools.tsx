import type { ReadLayer } from "@streets/core/read/read-layer";
import { TanStackDevtools } from "@tanstack/solid-devtools";
import type { Component } from "solid-js";
import ReadLayerPanel from "./ReadLayerPanel";

const AppDevtools: Component<{ readLayer: ReadLayer }> = (props) => (
  // 本番ビルドでは devtools-vite がこの要素を取り除くので、式が空にならないよう包む。
  <>
    <TanStackDevtools
      plugins={[
        {
          name: "Streets Core",
          render: <ReadLayerPanel readLayer={props.readLayer} />,
          defaultOpen: true,
        },
      ]}
    />
  </>
);

export default AppDevtools;
