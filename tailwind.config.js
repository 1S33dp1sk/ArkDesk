/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx,js,jsx}"],
  theme: {
    extend: {
      colors: {
        bg:     "#0b0c10",
        text:   "#e9edf1",
        muted:  "#aeb6bf",
        border: "rgba(255,255,255,0.08)",
        primary:"#6aa9ff",
        accent: "#b59cff",
      },
      borderRadius: {
        md: "16px",
        lg: "22px",
      },
      boxShadow: {
        elev1: "0 1px 1px rgba(0,0,0,.25), 0 8px 24px rgba(0,0,0,.35)",
        elev2: "0 2px 3px rgba(0,0,0,.25), 0 16px 40px rgba(0,0,0,.45)",
      },
      keyframes: {
        beam: {
          "0%": { transform: "translateX(-40%) rotate(8deg)" },
          "50%": { transform: "translateX(10%) rotate(8deg)" },
          "100%": { transform: "translateX(-40%) rotate(8deg)" },
        },
        float: {
          "0%,100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-8px)" },
        },
        glow: { "0%,100%": { opacity: .6 }, "50%": { opacity: 1 } },
        shimmer: { "0%": { left: "-40%" }, "100%": { left: "140%" } },
      },
      animation: {
        beam: "beam 9s ease-in-out infinite",
        float: "float 5s ease-in-out infinite",
        glow: "glow 2.2s ease-in-out infinite",
        shimmer: "shimmer 1.8s linear infinite",
      },
    },
  },
  plugins: [],
}
