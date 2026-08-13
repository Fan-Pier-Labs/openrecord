import globals from "globals";
import pluginJs from "@eslint/js";
import tseslint from "typescript-eslint";


export default [
  {ignores: ["dist/**", "**/node_modules/**", ".claude/**", "out/**", "scrapers/myChart/clo-to-jpg-converter/**", "scrapers/myChart/clo-image-parser/**", "sample_data/**", "pdfs/**", "fake-mychart/**", "npm-package/dist/**", "claude-desktop-extension/dist/**", "*.config.*", "**/*.js"]},
  {files: ["**/*.{ts}"]},
  {languageOptions: { globals: globals.node }},
  pluginJs.configs.recommended,
  ...tseslint.configs.recommended,
  // Type-aware rules. The project service resolves each file against its
  // package's tsconfig, so `bun run lint` (and CI) needs every package's deps
  // installed — a missing node_modules degrades imports to `any` and the rules
  // below silently stop seeing them.
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parserOptions: {
        // Deliberately no allowDefaultProject escape hatch: every TS file in
        // the repo belongs to a real tsconfig project, so every file gets full
        // type-aware linting. A new file outside every tsconfig fails lint
        // with a "not found by the project service" error — the fix is to put
        // it in a project, not to exempt it.
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/await-thenable": "error",
      "@typescript-eslint/only-throw-error": "error",
      "@typescript-eslint/prefer-promise-reject-errors": "error",
      "@typescript-eslint/restrict-plus-operands": "error",
      // Outside try/catch a `return await` is a pointless extra microtask;
      // inside, the await is load-bearing (it keeps the rejection in scope).
      "@typescript-eslint/return-await": ["error", "in-try-catch"],
      // `considerDefaultExhaustiveForUnions`: a switch with a `default` is
      // treated as exhaustive — the codebase uses deliberate fallbacks
      // (Markdown rendering, zod param mapping). Switches WITHOUT a default
      // must still name every union member.
      "@typescript-eslint/switch-exhaustiveness-check": ["error", {
        considerDefaultExhaustiveForUnions: true,
      }],
    },
  },
  // bun-types declares the `.rejects`/`.resolves` matchers as returning void,
  // but at runtime they return promises that MUST be awaited — so in test
  // files await-thenable flags ~67 awaits that are all load-bearing. Off until
  // bun-types types them as thenable.
  {
    files: ["**/*.test.ts", "**/__tests__/**"],
    rules: {
      "@typescript-eslint/await-thenable": "off",
    },
  },
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
    "eqeqeq": ["error", "smart"],
    "prefer-const": "error",
  }},
];
