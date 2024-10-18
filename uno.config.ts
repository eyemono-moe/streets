import {
  defineConfig,
  presetIcons,
  presetTypography,
  presetUno,
  transformerVariantGroup,
} from "unocss";

interface Colors {
  [key: string]: (Colors & { DEFAULT?: string }) | string;
}

const colors: Colors = {
  // l: unocssのgray系を除いた色のlの平均値
  // c: unocssのgray系を除いた色のcの平均値
  // see: https://github.com/unocss/unocss/blob/75fd665273ff7f2ffb16be8841f7fcd89c9b27a5/packages/preset-mini/src/_theme/colors.ts#L15-L327
  accent: {
    50: "oklch(from var(--theme-accent-color) 0.9558 0.01279 h / <alpha-value>)",
    100: "oklch(from var(--theme-accent-color) 0.9311 0.02943 h / <alpha-value>)",
    200: "oklch(from var(--theme-accent-color) 0.8882 0.05567 h / <alpha-value>)",
    300: "oklch(from var(--theme-accent-color) 0.8298 0.08846 h / <alpha-value>)",
    400: "oklch(from var(--theme-accent-color) 0.7388 0.11983 h / <alpha-value>)",
    500: "oklch(from var(--theme-accent-color) 0.6487 0.13675 h / <alpha-value>)",
    600: "oklch(from var(--theme-accent-color) 0.5653 0.13633 h / <alpha-value>)",
    700: "oklch(from var(--theme-accent-color) 0.4907 0.12249 h / <alpha-value>)",
    800: "oklch(from var(--theme-accent-color) 0.4196 0.10304 h / <alpha-value>)",
    900: "oklch(from var(--theme-accent-color) 0.3679 0.08639 h / <alpha-value>)",
    950: "oklch(from var(--theme-accent-color) 0.2684 0.06317 h / <alpha-value>)",
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
    }),
    presetTypography(),
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
      "text-body": "text-base",
      "text-caption": "text-xs",

      // text color
      "text-accent": "text-accent-5",
      "c-accent": "c-accent-500",
      "text-primary": "text-ui-9 dark:text-ui-1",
      "c-primary": "c-ui-9 dark:c-ui-1",
      "text-secondary": "text-ui-6 dark:text-ui-4",
      "c-secondary": "c-ui-6 dark:c-ui-4",

      // background color
      "bg-accent": "bg-accent-5",
      "bg-accent-hover": "bg-accent-6",
      "bg-accent-active": "bg-accent-7",

      "bg-primary": "bg-white dark:bg-ui-950",
      "bg-primary-hover": "bg-ui-50 dark:bg-ui-9",
      "bg-primary-active": "bg-ui-50 dark:bg-ui-8",

      "bg-secondary": "bg-ui-2 dark:bg-ui-8",

      // border color
      "border-primary": "b-ui-9 dark:b-ui-1",
    },
  ],
  transformers: [transformerVariantGroup()],
  preflights: [
    {
      getCSS: () => `
        * {
          scrollbar-width: thin;
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
