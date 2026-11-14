/** @type {import('tailwindcss').Config} */
export default {
  content: ["./client/index.html", "./client/src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: { serif: ["\"Source Serif 4\"", "Georgia", "serif"] },
      colors: {
        agentryx: {
          50:  "#f5f7ff",
          100: "#e8edff",
          500: "#5b6cff",
          600: "#4451e6",
          700: "#3640b8",
          900: "#1d2570",
        },
      },
    },
  },
  plugins: [],
};
