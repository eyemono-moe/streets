import { useNavigate } from "@solidjs/router";
import type { Component } from "solid-js";
import NavigateButton from "./NavigateButton";
import SearchPopover from "./SearchPopover";
import ShortcutButtons from "./ShortcutButtons";

const Navbar: Component = () => {
  const navigate = useNavigate();

  return (
    <div class="c-secondary grid grid-cols-[auto_minmax(0,1fr)_auto] divide-x">
      <div class="flex">
        <NavigateButton onClick={() => navigate("/settings")}>
          <div class="i-material-symbols:settings-outline-rounded aspect-square h-auto w-8" />
        </NavigateButton>
      </div>
      <div class="flex overflow-x-auto">
        <ShortcutButtons />
        <NavigateButton onClick={() => navigate("/add-column")}>
          <div class="i-material-symbols:add-rounded aspect-square h-auto w-8" />
        </NavigateButton>
      </div>
      <div class="flex">
        <SearchPopover />
      </div>
    </div>
  );
};

export default Navbar;
