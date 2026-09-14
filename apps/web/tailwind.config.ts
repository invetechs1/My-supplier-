import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#EAF6F1",
          100: "#CFEADF",
          200: "#9FD5BF",
          300: "#6FBF9F",
          400: "#3FA97F",
          500: "#1E8A62",
          600: "#0B6E4F",
          700: "#095A41",
          800: "#074633",
          900: "#053225",
        },
        amber: {
          400: "#F7C13D",
          500: "#F2A900",
          600: "#D18F00",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(16, 24, 40, 0.05), 0 1px 3px rgba(16, 24, 40, 0.06)",
        "card-hover": "0 4px 12px rgba(16, 24, 40, 0.08)",
      },
    },
  },
  plugins: [],
};

export default config;
