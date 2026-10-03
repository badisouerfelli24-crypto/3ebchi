import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./config/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Palette graffiti 3ebchi — voir config/site.ts pour le branding
        ink: "#0d0d0d", // near-black concrete
        spray: "#f5e400", // spray-paint neon yellow
        hot: "#ff2e2e", // hot red / Club Africain
        chalk: "#f2f2f2", // white chalk
      },
      fontFamily: {
        marker: ["var(--font-marker)", "cursive"],
        bebas: ["var(--font-bebas)", "sans-serif"],
        body: ["var(--font-inter)", "system-ui", "sans-serif"],
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(24px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        pop: {
          "0%": { transform: "scale(1) rotate(-3deg)" },
          "50%": { transform: "scale(1.08) rotate(1deg)" },
          "100%": { transform: "scale(1.04) rotate(-2deg)" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.6s ease-out both",
      },
    },
  },
  plugins: [],
};

export default config;
