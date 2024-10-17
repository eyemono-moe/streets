import { useLocation, useNavigate } from "@solidjs/router";
import { type Component, createSignal } from "solid-js";
import Logo from "../../../assets/logo.svg";
import NavigateButton from "./NavigateButton";
import ShortcutButtons from "./ShortcutButtons";

const Sidebar: Component = () => {
  const [lastLocation, setLastLocation] = createSignal<string>("/post");
  const navigate = useNavigate();
  const location = useLocation();

  // TODO: Collapsibleを使うようにする
  const handleClickPanelButton = () => {
    if (location.pathname === "/") {
      navigate(lastLocation());
    } else {
      const lastURL = `${location.pathname}${location.hash}${location.search}`;
      setLastLocation(lastURL);
      navigate("/");
    }
  };

  return (
    <div class="c-zinc-6 grid grid-rows-[auto_minmax(0,1fr)_auto] divide-y">
      <div class="flex flex-col">
        <NavigateButton onClick={handleClickPanelButton}>
          <div
            class="i-material-symbols:keyboard-double-arrow-left-rounded aspect-square h-auto w-8 transition-transform duration-100"
            classList={{
              "rotate-180": location.pathname === "/",
            }}
          />
        </NavigateButton>
        <NavigateButton onClick={() => navigate("/post")}>
          <div class="i-material-symbols:edit-square-outline-rounded aspect-square h-auto w-8" />
        </NavigateButton>
        <NavigateButton>
          <div class="i-material-symbols:search-rounded aspect-square h-auto w-8" />
        </NavigateButton>
      </div>
      <div class="flex flex-col">
        <ShortcutButtons />
        <NavigateButton onClick={() => navigate("/add-column")}>
          <div class="i-material-symbols:add-rounded aspect-square h-auto w-8" />
        </NavigateButton>
      </div>
      <div class="flex flex-col">
        <NavigateButton onClick={() => navigate("/settings")}>
          <div class="i-material-symbols:settings-outline-rounded aspect-square h-auto w-8" />
        </NavigateButton>
        <NavigateButton>
          <img src={Logo} alt="strands logo" class="aspect-square h-auto w-8" />
        </NavigateButton>
      </div>
    </div>
  );
};

export default Sidebar;
