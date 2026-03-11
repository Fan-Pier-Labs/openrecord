module.exports = {
  content: [
    "./src/renderer/**/*.{js,ts,jsx,tsx}",
    "./src/renderer/index.html"
  ],
  darkMode: ["class"],
  corePlugins: {
    preflight: false,
  },
  theme: {
    extend: {},
  },
  plugins: [
    require("tailwindcss-animate"),
    require("@tailwindcss/typography"),
    require("@tailwindcss/forms")
  ],
}