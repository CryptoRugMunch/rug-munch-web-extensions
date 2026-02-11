/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{ts,tsx,html}"],
  theme: {
    extend: {
      colors: {
        crm: {
          bg: "#0B0714",
          card: "#1a1025",
          gold: "#E7C55F",
          purple: "#7E4CFF",
          cyan: "#5FDDE7",
          red: "#FF4757",
          green: "#2ED573",
        },
      },
    },
  },
  plugins: [],
};
