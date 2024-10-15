import { useLocation } from "@solidjs/router";
import type { ParentComponent } from "solid-js";
import Columns from "../features/Column/components/Columns";
import Sidebar from "../features/Sidebar/components/Sidebar";

const Root: ParentComponent = (props) => {
  const location = useLocation();

  return (
    <div class="flex h-svh w-screen divide-x text-zinc-8">
      <Sidebar />
      <div
        class="relative h-full shrink-0 overflow-auto transition-width duration-100"
        classList={{
          "w-0 b-x-0!": location.pathname === "/",
          "w-100": location.pathname !== "/",
        }}
      >
        <div class="absolute right-0 h-full w-100 overflow-hidden">
          {props.children}
        </div>
      </div>
      <Columns />
    </div>
  );
};

export default Root;
