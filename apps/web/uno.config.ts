import { colorResolver } from "@unocss/preset-mini/utils";
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

  // 意味を持つ色。Penpot の Color Mode の text.danger・bg.danger.subtle・status.*。
  // テーマ色から作らない（アクセントを変えても、危険や成功の色は変わらない）。
  // ライト／ダークの値は preflight の変数に置き、UI からは色の値を書かずにこの名前で使う。
  danger: {
    DEFAULT: "var(--color-danger)",
    subtle: "var(--color-danger-subtle)",
  },
  status: {
    ok: "var(--color-status-ok)",
    warn: "var(--color-status-warn)",
    off: "var(--color-status-off)",
  },
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
  // 既定では .ts を読まない。クラス名を .ts に書くと（column-meta.ts のアイコンなど）、
  // 同じ名前がどこかの .tsx に無い限り CSS が作られず、黙って消える。
  content: {
    pipeline: {
      include: [/\.([jt]sx?|mdx?|html)($|\?)/],
    },
  },
  presets: [
    // dark: は `.dark` クラスで効かせる。OS 設定・ライト・ダークのどれに従うかはアプリが theme.ts で決める。
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
  ],
  theme: {
    fontFamily: {
      sans: '"Noto Sans JP", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"',
    },
    colors,
    /*
      動きは短く、始まりを速く終わりを緩める。要素が「どこから来たか」だけを
      見せ、待たせない。`prefers-reduced-motion` では preflight で 0ms に落とす。
    */
    animation: {
      keyframes: {
        "fade-in": "{from{opacity:0}to{opacity:1}}",
        "fade-out": "{from{opacity:1}to{opacity:0}}",
        "pop-in":
          "{from{opacity:0;transform:scale(0.97) translateY(-4px)}to{opacity:1;transform:none}}",
        "pop-out":
          "{from{opacity:1;transform:none}to{opacity:0;transform:scale(0.98)}}",
        // Ark UI の Collapsible が測った高さ。閉じている間は 0。
        "collapse-down": "{from{height:0}to{height:var(--height)}}",
        "collapse-up": "{from{height:var(--height)}to{height:0}}",
        "collapse-right": "{from{width:0}to{width:var(--width)}}",
        "collapse-left": "{from{width:var(--width)}to{width:0}}",
        "stack-in":
          "{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}",
        // その場で消える。to に transform を書かないので、終わりの位置は Drawer が inline で
        // 当てている transform（スワイプで引き下げた位置）になり、そこから動かない。
        "stack-out":
          "{from{opacity:1;transform:translate3d(0,var(--drawer-translate-y,0px),0)}to{opacity:0}}",
        "panel-in":
          "{from{opacity:0;transform:translateX(-12px)}to{opacity:1;transform:none}}",
        // 閉じようとしたが閉じられないとき、止めている理由の場所を揺らして示す。
        shake:
          "{0%,100%{transform:none}20%{transform:translateX(-6px)}40%{transform:translateX(6px)}60%{transform:translateX(-4px)}80%{transform:translateX(3px)}}",
      },
      durations: {
        "fade-in": "120ms",
        "fade-out": "100ms",
        "pop-in": "140ms",
        "pop-out": "100ms",
        "collapse-down": "160ms",
        "collapse-up": "140ms",
        "collapse-right": "160ms",
        "collapse-left": "140ms",
        "stack-in": "180ms",
        "stack-out": "140ms",
        "panel-in": "160ms",
        // 開閉ではなく注意を引く動きなので、開閉の 100〜180ms より長く取る。
        shake: "320ms",
      },
      timingFns: {
        "fade-in": "ease-out",
        // 消える側は最後の状態で止める。止めないと、取り除かれるまでの 1 フレームで元の見た目に戻ってちらつく。
        "fade-out": "ease-in both",
        "pop-in": "cubic-bezier(0.16, 1, 0.3, 1)",
        "pop-out": "ease-in both",
        "collapse-down": "cubic-bezier(0.16, 1, 0.3, 1)",
        "collapse-up": "ease-in both",
        "collapse-right": "cubic-bezier(0.16, 1, 0.3, 1)",
        "collapse-left": "ease-in both",
        "stack-in": "cubic-bezier(0.16, 1, 0.3, 1)",
        "stack-out": "ease-in both",
        "panel-in": "cubic-bezier(0.16, 1, 0.3, 1)",
        shake: "ease-out",
      },
    },
  },
  rules: [
    /*
      画面の外にあるノートの描画を飛ばす。デッキは数万要素になるので、テーマ色を
      変えたときのように木全体のスタイル計算が走ると、見えている分だけを計算する
      場合の 4 倍ほどかかる。`auto` は一度描いた高さを覚えるので、スクロール位置は
      ずれない（まだ描いていない分だけ 160px と見積もる）。
    */
    [
      "offscreen-skip",
      {
        "content-visibility": "auto",
        "contain-intrinsic-size": "auto 160px",
      },
    ],
    [
      /^scroll(?:bar)?-(track|thumb)-(.+)$/,
      ([s, section, colorMatch], context) => {
        const varName = `scroll${section}-bg`;
        const opacityVarName = `--un-${varName}-opacity`;
        const colorVarName = `--un-${varName}`;
        const res = colorResolver("color", varName)([s, colorMatch], context);

        if (!res) {
          return;
        }

        // @ts-ignore
        const color = res.color;
        // @ts-ignore
        const opacity = res[opacityVarName];

        if (!color) {
          return;
        }

        if (opacity) {
          return {
            [opacityVarName]: opacity,
            [colorVarName]: color,
            "scrollbar-color":
              "var(--un-scrollthumb-bg) var(--un-scrolltrack-bg)",
          };
        }

        return {
          [colorVarName]: color,
          "scrollbar-color":
            "var(--un-scrollthumb-bg) var(--un-scrolltrack-bg)",
        };
      },
    ],
  ],
  shortcuts: [
    {
      // text size
      // v1 の 3 段の型スケール (19/15/13)。v0 の 18/16/14 から詰めてある ——
      // マルチカラムでは 1 列に入る情報量が体験を決めるので、本文と補助情報の
      // 差を保ったまま全体を 1px ずつ落としている。
      "text-h3": "text-[19px]",
      "text-body": "text-[15px]",
      "text-caption": "text-[13px]",

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

      // motion
      // 開閉する部品の出入り。Ark UI が付ける data-state に合わせる。
      "motion-fade":
        "data-[state=open]:animate-fade-in data-[state=closed]:animate-fade-out",
      // 出どころ（トリガーの位置）から開く。Ark UI が --transform-origin を置く。
      "motion-pop":
        "origin-[var(--transform-origin)] data-[state=open]:animate-pop-in data-[state=closed]:animate-pop-out",
      // 重ねたカラム。Ark UI の Drawer が閉じる動きの終わりを待ってから外す。
      "motion-stack":
        "data-[state=open]:animate-stack-in data-[state=closed]:animate-stack-out",
      "motion-collapse":
        "overflow-hidden data-[state=open]:animate-collapse-down data-[state=closed]:animate-collapse-up",
      "motion-collapse-right":
        "overflow-hidden data-[state=open]:animate-collapse-right data-[state=closed]:animate-collapse-left",

      // scrollbar
      "scrollbar-color-theme":
        "scrollbar-track-ui-1 scrollbar-thumb-ui-4 dark:scrollbar-track-ui-9 dark:scrollbar-thumb-ui-6",
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
        /*
          OS のスクロールバーを消す。自前のスクロールバー（Ark UI の
          ScrollArea）を重ねる場所で使う —— 消さないと 2 本並ぶ。
        */
        .scrollbar-none {
          scrollbar-width: none;
        }
        .scrollbar-none::-webkit-scrollbar {
          display: none;
        }
        /*
          Ark UI は閉じている部品に hidden 属性を付ける。display を指定する
          ユーティリティ（flex / grid など）が当たっていると打ち消され、
          閉じたはずのメニューが出たままになる。
        */
        [hidden] {
          display: none !important;
        }
        /*
          アプリの中の重ね順をアプリの中に閉じ込める。ポップアップやダイアログは
          body の末尾へ出すので、z-index を足さなくても DOM の順でアプリより上に乗る。
          （Ark UI の Positioner は z-index を inline で上書きするので、クラスでは効かない）
        */
        #root,
        #storybook-root {
          isolation: isolate;
        }
        /* 意味を持つ色（theme.colors の danger・status）の値。Penpot の Color Mode。 */
        :root {
          --color-danger: #C5221F;
          --color-danger-subtle: #FCE8E6;
          --color-status-ok: #188038;
          --color-status-warn: #E37400;
          --color-status-off: oklch(from var(--theme-ui-color) 0.4455 calc(0.0374 * c / 0.37) h);
        }
        .dark {
          --color-danger: #F28B82;
          --color-danger-subtle: #3C1F1D;
          --color-status-ok: #81C995;
          --color-status-warn: #FDD663;
          --color-status-off: oklch(from var(--theme-ui-color) 0.7106 calc(0.0350 * c / 0.37) h);
        }
        @media (prefers-reduced-motion) {
          * {
            animation-duration: 0ms !important;
            transition-duration: 0ms !important;
          }
        }
      `,
    },
  ],
});
