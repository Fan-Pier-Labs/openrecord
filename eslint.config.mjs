import globals from "globals";
import pluginJs from "@eslint/js";
import tseslint from "typescript-eslint";
import importX from "eslint-plugin-import-x";


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
      // Referencing a class method without its receiver silently loses `this`.
      "@typescript-eslint/unbound-method": "error",
      // `str.match(re)` and `re.exec(str)` are identical for non-global
      // regexes, and exec is the clearer read; the rule declines to convert
      // /g patterns, where the two genuinely differ.
      "@typescript-eslint/prefer-regexp-exec": "error",
      // An async function that never awaits is either needlessly promise-typed
      // or missing the await it was written for; both deserve a look.
      "@typescript-eslint/require-await": "error",
      // Round-4 zero-violation set — enabling these required NO code changes.
      // Each zero was canary-verified: a planted violation fires before the
      // zero is trusted.
      "@typescript-eslint/no-unnecessary-type-arguments": "error",
      "@typescript-eslint/no-unnecessary-boolean-literal-compare": "error",
      "@typescript-eslint/prefer-string-starts-ends-with": "error",
      "@typescript-eslint/no-implied-eval": "error",
      "@typescript-eslint/no-array-delete": "error",
      "@typescript-eslint/no-duplicate-type-constituents": "error",
      "@typescript-eslint/no-redundant-type-constituents": "error",
      "@typescript-eslint/prefer-reduce-type-parameter": "error",
      "@typescript-eslint/no-for-in-array": "error",
      "@typescript-eslint/no-meaningless-void-operator": "error",
      "@typescript-eslint/no-mixed-enums": "error",
      // `a && a.b` reads as `a?.b`; the rule only converts when truthiness
      // semantics are preserved, and downgrades to a suggestion when the
      // expression VALUE changes (null/'' vs undefined) — those were
      // hand-verified (see the guard comments at the sites it must not touch).
      "@typescript-eslint/prefer-optional-chain": "error",
      // Type-aware: flags calls to anything @deprecated in its declaration
      // (caught the MCP SDK rename and zod's retired ZodTypeAny on day one).
      "@typescript-eslint/no-deprecated": "error",
      // Private fields assigned only in the constructor/initializer are marked
      // readonly so mutation shows up in review.
      "@typescript-eslint/prefer-readonly": "error",
      "@typescript-eslint/no-unnecessary-type-assertion": "error",
      // `.filter(p)[0]` builds a whole array to keep one element — `.find(p)`.
      "@typescript-eslint/prefer-find": "error",
      // `x as T` where `T` is just the non-null of x reads clearer as `x!`.
      "@typescript-eslint/non-nullable-type-assertion-style": "error",
      // A template literal wrapping one string and nothing else is just quotes.
      "@typescript-eslint/no-unnecessary-template-expression": "error",
      // `.catch(err => …)` gets `unknown`, matching useUnknownInCatchVariables.
      "@typescript-eslint/use-unknown-in-catch-callback-variable": "error",
      "@typescript-eslint/no-floating-promises": "error",
      // Type-only imports vanish at compile time; marking them keeps a
      // bundler/transpiler from pulling a module in (or keeping a side-effect
      // edge) for something that was only ever a type — stylistic for tsc,
      // load-bearing for bundlers. `inline-type-imports` merges into one
      // statement instead of splitting every import in two.
      // `disallowTypeAnnotations: false` keeps `typeof import(...)` legal —
      // npm-package's built-bundle test types a runtime dynamic import with it.
      "@typescript-eslint/consistent-type-imports": ["error", {
        fixStyle: "inline-type-imports",
        disallowTypeAnnotations: false,
      }],
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
      // A void-returning call in value position (`return console.log(x)`,
      // `const y = arr.push(v)`) reads as if it produced something; splitting
      // it into statement + bare return/binding-free call says what actually
      // happens. `ignoreArrowShorthand` keeps the idiomatic concise arrow
      // `() => doVoidThing()` — wrapping every callback in braces is noise,
      // and the void-typed context already ignores the value.
      "@typescript-eslint/no-confusing-void-expression": ["error", { ignoreArrowShorthand: true }],
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
  // files await-thenable flags ~67 awaits that are all load-bearing, and
  // no-confusing-void-expression flags the same `await expect(...)` sites
  // (awaiting a "void" expression) — 80 of its 81 repo-wide hits were exactly
  // this. Both off until bun-types types the matchers as thenable.
  {
    files: ["**/*.test.ts", "**/__tests__/**"],
    rules: {
      "@typescript-eslint/await-thenable": "off",
      // Test mocks are declared async to match Promise-typed callback
      // signatures (Transport, route handlers); an await-less async there is
      // the point, not an accident.
      "@typescript-eslint/require-await": "off",
      "@typescript-eslint/no-confusing-void-expression": "off",
      // Tests import dynamically on purpose: mock.module must be installed
      // before the module under test loads, and the parity suite re-imports
      // client surfaces to get fresh registrations.
      "no-restricted-syntax": "off",
    },
  },
  // Module-cycle detection for the scraper core. #263 made the session-renewal
  // graph acyclic; this locks that in so a cycle can't silently return behind
  // an eslint-disable. Scoped to scrapers/ + shared/ because the rule walks
  // every import transitively and is slow repo-wide. Both settings are
  // load-bearing: the resolver so `./foo` finds foo.ts, and the parsers map so
  // no-cycle can PARSE the imported .ts files — without it the rule silently
  // reports nothing (verified with a canary cycle; resolution alone is not
  // enough). Only no-cycle is enabled: no-unresolved false-positives on
  // `bun:test` imports in the test files this block also matches.
  {
    files: ["scrapers/**/*.ts", "shared/**/*.ts"],
    plugins: { "import-x": importX },
    settings: {
      "import-x/resolver": { typescript: true },
      "import-x/parsers": { "@typescript-eslint/parser": [".ts", ".tsx"] },
    },
    rules: {
      "import-x/no-cycle": "error",
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
    // The TS variant understands enums/type parameters; the core rule
    // false-positives on them.
    "no-shadow": "off",
    "@typescript-eslint/no-shadow": "error",
  }},
];
