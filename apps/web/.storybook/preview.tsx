import "@unocss/reset/tailwind-compat.css";
import "virtual:uno.css";
import { type Preview, createDecorator } from "storybook-solidjs-vite";

const preview: Preview = {
  parameters: {
    layout: "fullscreen",
  },
  decorators: [
    createDecorator((Story) => {
      document.documentElement.style.setProperty(
        "--theme-accent-color",
        "#8340bb",
      );
      document.documentElement.style.setProperty("--theme-ui-color", "#302070");
      // 幅はデザインのカラム幅（380px）に合わせる。
      return (
        <div class="c-primary min-h-screen bg-secondary p-6 font-sans">
          <div class="w-95 overflow-hidden bg-primary">
            <Story />
          </div>
        </div>
      );
    }),
  ],
};

export default preview;
