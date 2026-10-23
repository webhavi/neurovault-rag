/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: ["class", '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        obsidian: "#070A12",
        navy: {
          DEFAULT: "#0B1020",
          700: "#101731",
          600: "#141D3D",
        },
        pulse: {
          DEFAULT: "#42E8F5",
          soft: "#9EF2FA",
          dim: "#1FB6C4",
        },
        neural: {
          DEFAULT: "#9875FF",
          soft: "#BCA5FF",
          dim: "#6C4BD8",
        },
        ice: "#EAF2FF",
        steel: "#8A97B4",
        line: "rgba(102, 136, 190, 0.16)",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      boxShadow: {
        panel: "0 12px 40px -12px rgba(2, 6, 18, 0.8)",
        glowCyan: "0 0 24px -6px rgba(66, 232, 245, 0.45)",
        glowViolet: "0 0 24px -6px rgba(152, 117, 255, 0.45)",
      },
      animation: {
        "pulse-soft": "pulseSoft 2.6s ease-in-out infinite",
        shimmer: "shimmer 1.8s linear infinite",
        "spin-slow": "spin 2.4s linear infinite",
      },
      keyframes: {
        pulseSoft: {
          "0%, 100%": { opacity: "0.55" },
          "50%": { opacity: "1" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-400px 0" },
          "100%": { backgroundPosition: "400px 0" },
        },
      },
    },
  },
  plugins: [],
};
