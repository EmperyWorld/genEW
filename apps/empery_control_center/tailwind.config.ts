import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        void: "var(--ecc-void)",
        field: "var(--ecc-field)",
        panel: "var(--ecc-panel)",
        "panel-raised": "var(--ecc-panel-raised)",
        line: "var(--ecc-line)",
        "line-strong": "var(--ecc-line-strong)",
        signal: {
          DEFAULT: "var(--ecc-signal)",
          dim: "var(--ecc-signal-dim)",
          soft: "var(--ecc-signal-soft)",
        },
        metal: {
          DEFAULT: "var(--ecc-metal)",
          dim: "var(--ecc-metal-dim)",
        },
        ink: {
          DEFAULT: "var(--ecc-ink)",
          muted: "var(--ecc-ink-muted)",
          faint: "var(--ecc-ink-faint)",
        },
        ok: "var(--ecc-ok)",
        degraded: "var(--ecc-degraded)",
        down: "var(--ecc-down)",
        unknown: "var(--ecc-unknown)",
        busy: "var(--ecc-busy)",
        console: {
          bg: "var(--ecc-console-bg)",
          fg: "var(--ecc-console-fg)",
          dim: "var(--ecc-console-dim)",
          warn: "var(--ecc-console-warn)",
          err: "var(--ecc-console-err)",
        },
      },
      fontFamily: {
        display: ["Sora", "sans-serif"],
        body: ["Manrope", "sans-serif"],
        mono: ["IBM Plex Mono", "monospace"],
      },
      borderRadius: {
        sm: "var(--ecc-radius-sm)",
        md: "var(--ecc-radius-md)",
        lg: "var(--ecc-radius-lg)",
      },
      boxShadow: {
        focus: "0 0 0 2px var(--ecc-focus-ring)",
      },
    },
  },
  plugins: [],
};

export default config;
