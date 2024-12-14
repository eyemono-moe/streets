import {
  defineConfig,
  presetIcons,
  presetTypography,
  presetUno,
  transformerVariantGroup,
} from "unocss";
import { presetScrollbar } from "./src/uno/presetScrollbar";

interface Colors {
  [key: string]: (Colors & { DEFAULT?: string }) | string;
}

const colors: Colors = {
  // l: unocssのgray系を除いた色のlの平均値
  // c: unocssのgray系を除いた色のcの平均値を大きめに調整した値
  // see: https://github.com/unocss/unocss/blob/75fd665273ff7f2ffb16be8841f7fcd89c9b27a5/packages/preset-mini/src/_theme/colors.ts#L15-L327
  accent: {
    50: "oklch(from var(--theme-accent-color) 0.9558 0.018 h / <alpha-value>)",
    100: "oklch(from var(--theme-accent-color) 0.9311 0.05 h / <alpha-value>)",
    200: "oklch(from var(--theme-accent-color) 0.8882 0.09 h / <alpha-value>)",
    300: "oklch(from var(--theme-accent-color) 0.8298 0.14 h / <alpha-value>)",
    400: "oklch(from var(--theme-accent-color) 0.7388 0.195 h / <alpha-value>)",
    500: "oklch(from var(--theme-accent-color) 0.6487 0.24 h / <alpha-value>)",
    600: "oklch(from var(--theme-accent-color) 0.5653 0.235 h / <alpha-value>)",
    700: "oklch(from var(--theme-accent-color) 0.4907 0.22 h / <alpha-value>)",
    800: "oklch(from var(--theme-accent-color) 0.4196 0.185 h / <alpha-value>)",
    900: "oklch(from var(--theme-accent-color) 0.3679 0.15 h / <alpha-value>)",
    950: "oklch(from var(--theme-accent-color) 0.2684 0.11 h / <alpha-value>)",
  },
  accentOriginal: "var(--theme-accent-color)",

  // l: unocssのslateのLと同じ値
  // c: unocssのslateのcと同じ値 * --theme-ui-colorのcの値(cの最大値は約0.37)
  ui: {
    50: "oklch(from var(--theme-ui-color) 0.9841 calc(0.0033 * c / 0.37) h / <alpha-value>)",
    100: "oklch(from var(--theme-ui-color) 0.9682 calc(0.0068 * c / 0.37) h / <alpha-value>)",
    200: "oklch(from var(--theme-ui-color) 0.9287 calc(0.0125 * c / 0.37) h / <alpha-value>)",
    300: "oklch(from var(--theme-ui-color) 0.8689 calc(0.0198 * c / 0.37) h / <alpha-value>)",
    400: "oklch(from var(--theme-ui-color) 0.7106 calc(0.0350 * c / 0.37) h / <alpha-value>)",
    500: "oklch(from var(--theme-ui-color) 0.5543 calc(0.0406 * c / 0.37) h / <alpha-value>)",
    600: "oklch(from var(--theme-ui-color) 0.4455 calc(0.0374 * c / 0.37) h / <alpha-value>)",
    700: "oklch(from var(--theme-ui-color) 0.3716 calc(0.0391 * c / 0.37) h / <alpha-value>)",
    800: "oklch(from var(--theme-ui-color) 0.2794 calc(0.0368 * c / 0.37) h / <alpha-value>)",
    900: "oklch(from var(--theme-ui-color) 0.2076 calc(0.0398 * c / 0.37) h / <alpha-value>)",
    950: "oklch(from var(--theme-ui-color) 0.1287 calc(0.0405 * c / 0.37) h / <alpha-value>)",
  },
  uiOriginal: "var(--theme-ui-color)",
};

// assign default color and add color shortcuts
for (const color of Object.values(colors)) {
  if (typeof color !== "string" && color !== undefined) {
    color.DEFAULT = color.DEFAULT || (color[400] as string);
    for (const key of Object.keys(color)) {
      const short = +key / 100;
      if (short === Math.round(short)) {
        color[short] = color[key];
      }
    }
  }
}

export default defineConfig({
  presets: [
    presetUno(),
    presetIcons({
      autoInstall: true,
      collections: {
        streets: {
          logo: '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" fill="none"><g clip-path="url(#a)"><path fill="url(#b)" d="M68.478 252.326c-31.242-31.242-31.242-81.895 0-113.137L186.706 20.961c3.169-3.169 4.753-4.753 6.579-5.346a8 8 0 0 1 4.945 0c1.826.593 3.41 2.177 6.578 5.346l38.467 38.466c3.168 3.168 4.752 4.752 5.346 6.579a8 8 0 0 1 0 4.944c-.594 1.827-2.178 3.411-5.346 6.58z"/><g clip-path="url(#c)"><path fill="#B58CD6" d="m68.478 252.326 56.569-56.569 11.313 11.314-56.568 56.569z"/></g><path fill="url(#d)" d="M79.792 263.64 207.07 136.36c31.242-31.242 81.895-31.242 113.137 0L192.929 263.64c-31.242 31.242-81.895 31.242-113.137 0"/><g clip-path="url(#e)"><path fill="#B58CD6" d="m263.64 192.929 56.569-56.569 11.313 11.314-56.568 56.569z"/></g><path fill="url(#f)" d="M156.725 340.573c-3.168-3.168-4.752-4.752-5.346-6.579a8 8 0 0 1 0-4.944c.594-1.827 2.178-3.411 5.346-6.579l174.797-174.797c31.242 31.242 31.242 81.895 0 113.137L213.294 379.039c-3.169 3.169-4.753 4.753-6.579 5.346a8 8 0 0 1-4.944 0c-1.827-.593-3.411-2.177-6.579-5.346z"/></g><defs><linearGradient id="b" x1="40.194" x2="224.042" y1="224.042" y2="40.194" gradientUnits="userSpaceOnUse"><stop stop-color="#661FA0"/><stop offset="1" stop-color="#8340BB"/></linearGradient><linearGradient id="d" x1="108.076" x2="291.924" y1="291.924" y2="108.076" gradientUnits="userSpaceOnUse"><stop stop-color="#661FA0"/><stop offset="1" stop-color="#8340BB"/></linearGradient><linearGradient id="f" x1="175.958" x2="359.806" y1="359.806" y2="175.958" gradientUnits="userSpaceOnUse"><stop stop-color="#661FA0"/><stop offset="1" stop-color="#8340BB"/></linearGradient><clipPath id="a"><path fill="#fff" d="M11.91 195.757 195.757 11.909 388.09 204.242 204.243 388.09z"/></clipPath><clipPath id="c"><path fill="#fff" d="M68.478 252.326 252.326 68.478l11.314 11.314L79.792 263.64z"/></clipPath><clipPath id="e"><path fill="#fff" d="M136.36 320.208 320.208 136.36l11.313 11.314-183.847 183.848z"/></clipPath></defs></svg>',
        },
      },
    }),
    presetTypography(),
    presetScrollbar(),
  ],
  theme: {
    fontFamily: {
      sans: '"Noto Sans JP", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"',
    },
    colors,
  },
  shortcuts: [
    {
      // text size
      "text-h3": "text-lg",
      "text-body": "text-base",
      "text-caption": "text-sm",

      // text color
      "c-primary": "c-ui-9 dark:c-ui-1",
      "c-secondary": "c-ui-6 dark:c-ui-4",
      "text-link":
        "text-accent-5 visited:text-accent-8 dark:text-accent-5 dark:visited:text-accent-4 hover:underline",

      // background color
      "bg-accent-primary": "bg-accent-5",
      "bg-accent-hover": "bg-accent-6",
      "bg-accent-active": "bg-accent-7",

      "bg-primary": "bg-white dark:bg-ui-950",
      "bg-secondary": "bg-ui-1 dark:bg-ui-8",
      "bg-tertiary": "bg-ui-2 dark:bg-ui-7",

      "bg-alpha-hover": "bg-ui-2/20 dark:bg-ui-7/20",
      "bg-alpha-active": "bg-ui-2/40 dark:bg-ui-7/40",

      // border color
      "border-primary": "b-ui-2 dark:b-ui-7",

      // scrollbar
      "scrollbar-color-theme":
        "scrollbar-track:bg-ui-1 scrollbar-track-ui-1 scrollbar-thumb:bg-ui-4 scrollbar-thumb-ui-4 dark:scrollbar-track:bg-ui-9 dark:scrollbar-track-ui-9 dark:scrollbar-thumb:bg-ui-6 dark:scrollbar-thumb-ui-6",
    },
  ],
  transformers: [transformerVariantGroup()],
  preflights: [
    {
      getCSS: () => `
        * {
          scrollbar-width: thin;
          border-color: inherit;
        }
        @media (prefers-reduced-motion) {
          * {
            animation-duration: 0ms !important;
            transition-duration: 0ms !important;
          }
        }
        nl-auth {
          /* KobalteのDialogを開いた状態でもNostrLogin側でpointer eventを受け取れるようにする */
          pointer-events: auto;
        }
      `,
    },
  ],
});
