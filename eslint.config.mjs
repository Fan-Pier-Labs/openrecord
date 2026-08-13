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
        projectService: {
          // Files no tsconfig includes: build configs, dev scripts, examples,
          // and the test directories the package tsconfigs exclude. They lint
          // against a default project instead of failing to parse.
          allowDefaultProject: [
            "claude-desktop-extension/tsup.config.ts",
            "npm-package/tsup.config.ts",
            "npm-package/examples/*.ts",
            "dev-scripts/*.ts",
            "expo-app/src/__tests__/*.ts",
            "expo-app/src/lib/ai/__tests__/*.ts",
            "expo-app/src/lib/memory/__tests__/*.ts",
            "newsletter-lambda/src/__tests__/*.ts",
            "openrecord-demo-lambda/src/__tests__/*.ts",
            "openrecord-splash/__tests__/*.ts",
            "tests/*.ts",
            "tests/integration/ci/*.ts",
          ],
          // The default cap is 8; the globs above match 18 files today.
          maximumDefaultProjectFileMatchCount_THIS_WILL_SLOW_DOWN_LINTING: 24,
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/await-thenable": "error",
      "@typescript-eslint/no-floating-promises": "error",
      // `attributes: false` allows the idiomatic async JSX handler
      // (onPress={handleSave}) — React ignores the returned promise, and the
      // alternative is wrapping every handler in `() => void f()` noise. All
      // other void positions (callbacks, setInterval, spreads) stay checked.
      "@typescript-eslint/no-misused-promises": ["error", {
        checksVoidReturn: { attributes: false },
      }],
      // No runtime import() in product code — a static import says what a
      // module needs where every reader and every bundler can see it. The
      // few load-bearing dynamic imports (module-cycle breakers, an
      // import-order requirement, deliberate cold-start deferral) carry a
      // line-level disable with the reason. Test files are exempt below:
      // they import dynamically to control mock/module ordering.
      "no-restricted-syntax": ["error", {
        selector: "ImportExpression",
        message: "No runtime import() in product code — use a static import, or disable this line with a comment saying why the dynamic import is load-bearing.",
      }],
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
      // Tests import dynamically on purpose: mock.module must be installed
      // before the module under test loads, and the parity suite re-imports
      // client surfaces to get fresh registrations.
      "no-restricted-syntax": "off",
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
