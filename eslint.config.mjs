import globals from "globals";
import pluginJs from "@eslint/js";
import tseslint from "typescript-eslint";


export default [
  {ignores: ["dist/**", "**/node_modules/**", ".claude/**", "out/**", "scrapers/myChart/clo-to-jpg-converter/**", "scrapers/myChart/clo-image-parser/**", "sample_data/**", "pdfs/**", "fake-mychart/**", "npm-package/dist/**", "claude-desktop-extension/dist/**", "*.config.*", "**/*.js"]},
  {files: ["**/*.{ts}"]},
  {languageOptions: { globals: globals.node }},
  pluginJs.configs.recommended,
  ...tseslint.configs.recommended,
  {rules: {
    "@typescript-eslint/no-explicit-any": "error",
    // Underscore-prefixed parameters are deliberately unused — the repo's
    // convention for mock/transport signatures that must match a shape.
    "@typescript-eslint/no-unused-vars": ["error", {
      args: "after-used",
      argsIgnorePattern: "^_",
      varsIgnorePattern: "^_",
      caughtErrorsIgnorePattern: "^_",
    }],
  }},
];
