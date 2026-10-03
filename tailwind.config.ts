import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./config/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // --- v2 (minimal futuriste) ---
        bg: "#0a0a0b",
        surface: "#111113",
        line: "rgba(255,255,255,0.08)",
        fg: "#f5f5f4",
        muted: "#a1a1aa",
        cyan: "#22d3ee",
        pink: "#f472b6",
        violet: "#a78bfa",
        pole: "#ff3b3b", // rouge barber-pole / Club Africain
        wa: "#25d366", // WhatsApp
        // --- v1 (graffiti, /v1) ---
        ink: "#0d0d0d", // near-black concrete
        spray: "#f5e400", // spray-paint neon yellow
        hot: "#ff2e2e", // hot red / Club Africain
        chalk: "#f2f2f2", // white chalk
      },
      fontFamily: {
        display: ["var(--font-display)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
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
