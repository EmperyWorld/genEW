import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ["Sora", "sans-serif"],
        body: ["Manrope", "sans-serif"],
      },
      colors: {
        ink: {
          DEFAULT: "#e8eef7",
          muted: "#9aa8bc",
        },
        panel: "rgb(12 18 28 / 0.72)",
        signal: "#5eead4",
      },
    },
  },
  plugins: [],
} satisfies Config;
