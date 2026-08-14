import globals from "globals";
import pluginJs from "@eslint/js";
import tseslint from "typescript-eslint";
import importX from "eslint-plugin-import-x";
import regexp from "eslint-plugin-regexp";
import sonarjs from "eslint-plugin-sonarjs";
import eslintComments from "@eslint-community/eslint-plugin-eslint-comments";
import reactHooks from "eslint-plugin-react-hooks";


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
      // `indexOf(...) !== -1` and single-token regex tests read clearer as `.includes(...)`.
      "@typescript-eslint/prefer-includes": "error",
      // Referencing a class method without its receiver silently loses `this`.
      "@typescript-eslint/unbound-method": "error",
      // `str.match(re)` and `re.exec(str)` are identical for non-global
      // regexes, and exec is the clearer read; the rule declines to convert
      // /g patterns, where the two genuinely differ.
      "@typescript-eslint/prefer-regexp-exec": "error",
      // An async function that never awaits is either needlessly promise-typed
      // or missing the await it was written for; both deserve a look.
      "@typescript-eslint/require-await": "error",
      // `parseInt(s)` reads as "parse a decimal number", but the radix comes
      // from the string: "0x10" is 16, not 0. Every call says which base it
      // meant.
      "radix": "error",
      // A `.map`/`.filter`/`.reduce` callback that falls off its end yields
      // `undefined` for that element and the array quietly fills with holes —
      // a callback run only for its side effects belongs in `.forEach`.
      "array-callback-return": "error",
      // A bare `.sort()` stringifies every element first, so numbers come out
      // [1, 10, 2] and Dates sort by their English text. Only an array that is
      // already string[] may sort without a comparator.
      "@typescript-eslint/require-array-sort-compare": "error",
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
      // Companion to the rule above: when EVERY specifier is inline-`type`,
      // `verbatimModuleSyntax` (on in all five projects) still emits a runtime
      // `import "./x"`, keeping the module edge and its side effects alive for
      // something that was only ever a type. Hoisting the marker to the
      // statement drops the edge.
      "@typescript-eslint/no-import-type-side-effects": "error",
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
      // A non-primitive in a string position renders "[object Object]" — in a
      // health-data app that's garbage where a patient's data should be.
      "@typescript-eslint/no-base-to-string": "error",
      // A void-returning call in value position (`return console.log(x)`,
      // `const y = arr.push(v)`) reads as if it produced something; splitting
      // it into statement + bare return/binding-free call says what actually
      // happens. `ignoreArrowShorthand` keeps the idiomatic concise arrow
      // `() => doVoidThing()` — wrapping every callback in braces is noise,
      // and the void-typed context already ignores the value.
      "@typescript-eslint/no-confusing-void-expression": ["error", { ignoreArrowShorthand: true }],
      "@typescript-eslint/only-throw-error": "error",
      "@typescript-eslint/prefer-promise-reject-errors": "error",
      // Only the object-typed `||` sites, where `??` is provably identical: an
      // object is always truthy, so `a || b` and `a ?? b` cannot diverge.
      // `ignorePrimitives` deliberately exempts string/number/boolean/bigint,
      // and that exemption is a decision, not a gap. For a primitive the two
      // operators differ exactly when the left side is `''`, `0`, or `false`,
      // and this codebase leans on that difference: `providerName || "Unknown"`
      // with an empty-string provider name yields `"Unknown"` today, while `??`
      // would yield `""` and write a blank provider into a patient's chart.
      // Unconfigured the rule flags 277 sites (244 of them in `scrapers/`);
      // each needs an individual judgement about what an empty string means
      // there, which is a data audit, not a lint autofix. If someone takes that
      // audit on, narrow `ignorePrimitives` then — until then, off by intent.
      "@typescript-eslint/prefer-nullish-coalescing": ["error", {
        ignorePrimitives: { string: true, number: true, boolean: true, bigint: true },
      }],
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
      // Spreading a Map, Set, class instance, function or array into an object
      // produces something other than what it reads as — indices for an array,
      // an empty object for a Map. Caught the header merge in scraperFetch,
      // the single point every outbound request in the product passes through.
      "@typescript-eslint/no-misused-spread": "error",
      // A promise executor's return value is discarded, so `new Promise(r =>
      // setTimeout(r, ms))` quietly throws away a timer handle — and the same
      // shorthand around an async call throws away the promise, leaving the
      // rejection unhandled and the executor's own resolve never reached.
      // Braces around the body make the discard explicit.
      "no-promise-executor-return": "error",

      // ── Round-5 zero-violation set ────────────────────────────────────────
      // Everything below was measured at 0 violations repo-wide and enabled
      // without touching a line of product code. Each was canary-verified: a
      // planted violation fires before the zero is trusted, because a rule
      // that silently matches nothing is indistinguishable from a clean repo.
      // These are ratchets — they cost nothing today and stop the first
      // instance from arriving.

      // Legacy and injection-shaped APIs. All of these are absent today; the
      // ban is so the first `eval`, `new Function(userInput)` or
      // `javascript:` URL has to be argued for in review rather than merged.
      // This is a health-data app parsing untrusted portal HTML.
      // (`no-implied-eval` is already on above.)
      "no-eval": "error",
      "no-new-func": "error",
      "no-script-url": "error",
      "no-proto": "error",
      "no-caller": "error",
      "no-extend-native": "error",
      "no-iterator": "error",
      "no-new-wrappers": "error",
      "no-new-native-nonconstructor": "error",
      "no-multi-str": "error",

      // Silent-failure shapes. Each of these compiles, runs, and does
      // something other than what it reads as.
      "no-self-compare": "error",
      // A loop whose condition can never change, or whose body always exits on
      // the first pass — both are almost always an unfinished edit.
      "no-unmodified-loop-condition": "error",
      "no-unreachable-loop": "error",
      // `new Promise(async (resolve) => …)`: a throw inside the async executor
      // rejects nothing and the promise hangs forever.
      "no-async-promise-executor": "error",
      // `return` in a constructor silently discards the instance.
      "no-constructor-return": "error",
      // '${x}' in a plain-quoted string is a template literal someone forgot
      // to backtick — it ships the placeholder text to the user.
      "no-template-curly-in-string": "error",
      // Assignment and comma-sequences inside an expression read as
      // comparison and as arguments respectively.
      "no-return-assign": "error",
      "no-sequences": "error",
      "no-labels": "error",
      // `for…in` walks the prototype chain; the guard (or Object.keys) is the
      // difference between iterating a scraped object and iterating whatever
      // a library put on Object.prototype.
      "guard-for-in": "error",
      // Reassigning a parameter makes the caller's argument and the local name
      // silently diverge halfway down a function.
      "no-param-reassign": "error",
      // A getter with no setter (or a pair defined far apart) reads as a
      // writable property and silently drops the write.
      "accessor-pairs": "error",
      "grouped-accessor-pairs": "error",
      // A `default` that isn't last is dead code for every case after it.
      "default-case-last": "error",
      // `let x = undefined` defeats TDZ and reads as an intentional value.
      "no-undef-init": "error",

      // Modern equivalents that say the same thing more clearly.
      "prefer-object-has-own": "error",
      "prefer-object-spread": "error",
      "prefer-regex-literals": "error",
      "prefer-exponentiation-operator": "error",
      "operator-assignment": "error",
      "no-useless-concat": "error",
      "no-useless-rename": "error",
      // An undescribed Symbol() is untraceable in a debugger.
      "symbol-description": "error",

      // Type-level equivalents of the above, plus TS-only footguns.
      // Comparing an enum member to a raw literal type-checks and silently
      // stops matching the moment the enum's backing value changes.
      "@typescript-eslint/no-unsafe-enum-comparison": "error",
      // Bare `Function` accepts any signature and returns `any`.
      "@typescript-eslint/no-unsafe-function-type": "error",
      // `-someString` is NaN, not a number.
      "@typescript-eslint/no-unsafe-unary-minus": "error",
      // `void` outside a return position means "any value, ignored" — as a
      // parameter or union member it is almost always a mistake for
      // `undefined` or `never`.
      "@typescript-eslint/no-invalid-void-type": "error",
      "@typescript-eslint/no-useless-empty-export": "error",
      "@typescript-eslint/no-useless-constructor": "error",
      "@typescript-eslint/no-unnecessary-qualifier": "error",
      "@typescript-eslint/no-unnecessary-parameter-property-assignment": "error",
      // An optional parameter before a required one can never be omitted.
      "@typescript-eslint/default-param-last": "error",
      "@typescript-eslint/prefer-for-of": "error",
      "@typescript-eslint/prefer-function-type": "error",
      "@typescript-eslint/prefer-literal-enum-member": "error",
      "@typescript-eslint/prefer-return-this-type": "error",
      // A getter and setter for the same property that disagree on type let a
      // write round-trip into a different value than it came in as.
      "@typescript-eslint/related-getter-setter-pairs": "error",
      "@typescript-eslint/class-literal-property-style": "error",
      "@typescript-eslint/consistent-indexed-object-style": "error",
      // Re-exporting a type through a value export keeps the module edge alive
      // at runtime — the export side of consistent-type-imports above.
      "@typescript-eslint/consistent-type-exports": "error",
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
      // Round-5 zero-violation set, scoped here for the same reason as
      // no-cycle: import-x resolves every specifier, which is slow repo-wide.
      // A module importing itself, or exporting a `let`, is a bug that reads
      // as working code; the path rules keep `../../shared/x` from drifting
      // into three spellings of the same module.
      "import-x/no-self-import": "error",
      "import-x/no-mutable-exports": "error",
      "import-x/no-useless-path-segments": "error",
      "import-x/no-absolute-path": "error",
      "import-x/no-empty-named-blocks": "error",
    },
  },
  // The two React clients (the Expo app and the splash demo) were linted by
  // every rule above and by no React rule at all. rules-of-hooks is the one
  // that matters most: a hook behind an `if` or inside a loop desynchronizes
  // React's hook order and crashes at runtime, and nothing else in the
  // toolchain — not tsc, not the tests — can see it. Zero violations today.
  //
  // exhaustive-deps is deliberately NOT enabled here. It has 7 real hits, and
  // each one needs its own judgment call (adding a dep can turn a stale
  // closure into a re-render loop), so it gets its own change rather than
  // riding along with a zero-violation ratchet.
  {
    files: ["expo-app/**/*.ts", "expo-app/**/*.tsx", "openrecord-splash/**/*.ts", "openrecord-splash/**/*.tsx"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
    },
  },
  // ── Round-6 zero-violation set: three new plugins ────────────────────────
  // Every rule below measured 0 violations repo-wide and was canary-verified.
  //
  // eslint-plugin-regexp earns its install on one thing: this codebase runs
  // regexes over HTML scraped from third-party portals, so a regex bug is a
  // parsing bug on someone's medical record and a catastrophic-backtracking
  // regex is a hang. The six rules with violations are NOT listed here; each
  // lands in its own PR (no-super-linear-backtracking 13, prefer-w 14,
  // use-ignore-case 10, no-unused-capturing-group 7,
  // optimal-quantifier-concatenation 3, strict 1). Listed explicitly rather
  // than spreading `flat/recommended` minus exclusions, because an "off" entry
  // here would silently win over the "error" those PRs add.
  {
    files: ["**/*.ts", "**/*.tsx"],
    plugins: { regexp, sonarjs, "@eslint-community/eslint-comments": eslintComments },
    rules: {
      "regexp/confusing-quantifier": "error",
      "regexp/control-character-escape": "error",
      "regexp/match-any": "error",
      "regexp/negation": "error",
      "regexp/no-contradiction-with-assertion": "error",
      "regexp/no-dupe-characters-character-class": "error",
      "regexp/no-dupe-disjunctions": "error",
      "regexp/no-empty-alternative": "error",
      "regexp/no-empty-capturing-group": "error",
      "regexp/no-empty-character-class": "error",
      "regexp/no-empty-group": "error",
      "regexp/no-empty-lookarounds-assertion": "error",
      "regexp/no-empty-string-literal": "error",
      "regexp/no-escape-backspace": "error",
      "regexp/no-extra-lookaround-assertions": "error",
      "regexp/no-invalid-regexp": "error",
      "regexp/no-invisible-character": "error",
      "regexp/no-lazy-ends": "error",
      "regexp/no-legacy-features": "error",
      "regexp/no-misleading-capturing-group": "error",
      "regexp/no-misleading-unicode-character": "error",
      "regexp/no-missing-g-flag": "error",
      "regexp/no-non-standard-flag": "error",
      "regexp/no-obscure-range": "error",
      "regexp/no-optional-assertion": "error",
      "regexp/no-potentially-useless-backreference": "error",
      "regexp/no-trivially-nested-assertion": "error",
      "regexp/no-trivially-nested-quantifier": "error",
      "regexp/no-useless-assertions": "error",
      "regexp/no-useless-backreference": "error",
      "regexp/no-useless-character-class": "error",
      "regexp/no-useless-dollar-replacements": "error",
      "regexp/no-useless-escape": "error",
      "regexp/no-useless-flag": "error",
      "regexp/no-useless-lazy": "error",
      "regexp/no-useless-non-capturing-group": "error",
      "regexp/no-useless-quantifier": "error",
      "regexp/no-useless-range": "error",
      "regexp/no-useless-set-operand": "error",
      "regexp/no-useless-string-literal": "error",
      "regexp/no-useless-two-nums-quantifier": "error",
      "regexp/no-zero-quantifier": "error",
      "regexp/optimal-lookaround-quantifier": "error",
      "regexp/prefer-character-class": "error",
      "regexp/prefer-d": "error",
      "regexp/prefer-plus-quantifier": "error",
      "regexp/prefer-predefined-assertion": "error",
      "regexp/prefer-question-quantifier": "error",
      "regexp/prefer-range": "error",
      "regexp/prefer-set-operation": "error",
      "regexp/prefer-star-quantifier": "error",
      "regexp/prefer-unicode-codepoint-escapes": "error",
      "regexp/simplify-set-operations": "error",
      "regexp/sort-flags": "error",
      // Each of these is a bug detector, not a style rule: code that compiles,
      // runs, and does something other than what it says.
      "sonarjs/no-identical-expressions": "error",
      "sonarjs/no-all-duplicated-branches": "error",
      "sonarjs/no-identical-conditions": "error",
      "sonarjs/no-element-overwrite": "error",
      "sonarjs/no-use-of-empty-return-value": "error",
      "sonarjs/no-empty-collection": "error",
      "sonarjs/no-unused-collection": "error",
      "sonarjs/no-dead-store": "error",
      "sonarjs/non-existent-operator": "error",
      "sonarjs/no-same-line-conditional": "error",
      "sonarjs/no-gratuitous-expressions": "error",
      "sonarjs/no-inverted-boolean-check": "error",
      "sonarjs/no-redundant-boolean": "error",
      "sonarjs/no-collapsible-if": "error",
      "sonarjs/prefer-single-boolean-return": "error",
      "sonarjs/no-nested-switch": "error",
      "sonarjs/no-ignored-return": "error",
      // A disable comment is a claim that a rule is wrong here. These keep that
      // claim honest: one that no longer suppresses anything is deleted rather
      // than left as decoration, and a blanket `/* eslint-disable */` (which
      // silently turns off every rule for the rest of the file) is refused.
      // `require-description` is not here — it has 25 sites and lands separately.
      // `no-unused-disable` is deliberately absent: ESLint 9 reports unused
      // directives itself (canary-confirmed — the built-in fires on every case
      // the plugin rule would, and the plugin rule never reports at all), so
      // enabling it would imply a check that never runs.
      "@eslint-community/eslint-comments/no-unlimited-disable": "error",
      "@eslint-community/eslint-comments/no-duplicate-disable": "error",
      "@eslint-community/eslint-comments/no-aggregating-enable": "error",
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
