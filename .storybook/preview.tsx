import "@unocss/reset/tailwind-compat.css";
import "virtual:uno.css";
import "unfonts.css";
import { type Preview, createDecorator } from "storybook-solidjs-vite";

const preview: Preview = {
  globalTypes: {
    colorMode: {
      description: "表示するカラーモード",
      toolbar: {
        icon: "mirror",
        items: [
          { value: "light", title: "Light" },
          { value: "dark", title: "Dark" },
        ],
      },
    },
  },
  initialGlobals: {
    colorMode: "light",
  },
  parameters: {
    layout: "centered",
    controls: { expanded: true },
    a11y: { test: "todo" },
  },
  decorators: [
    createDecorator((Story, context) => {
      const dark = context.globals.colorMode === "dark";
      document.documentElement.classList.toggle("dark", dark);
      document.documentElement.style.setProperty(
        "--theme-accent-color",
        "#8340bb",
      );
      document.documentElement.style.setProperty("--theme-ui-color", "#302070");
      return (
        <div class="c-primary min-h-screen bg-primary p-6">
          <div class="w-95 overflow-hidden border border-primary bg-primary">
            <Story />
          </div>
        </div>
      );
    }),
  ],
};

export default preview;
