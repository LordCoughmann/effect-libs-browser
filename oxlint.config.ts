import effect from "@mpsuesser/oxlint-plugin-effect";
import { defineConfig } from "oxlint";

export default defineConfig({
  // Effect plugin with recommended rules (then we disable redundant ones)
  extends: [effect.configs.recommended],

  // Built-in plugins from original .oxlintrc.json
  plugins: ["typescript", "unicorn", "oxc", "import"],

  // Categories from original config
  categories: {
    correctness: "error",
  },

  // Environment from original config
  env: {
    builtin: true,
  },

  // Ignore patterns from original config
  ignorePatterns: [
    "repos/**",
    "packages/cloudflare-playwright/**",
    // Stub re-exports emitted by tsdown + rolldown-plugin-dts into src/
    // during a multi-package build (typescript@7 + tsgo generator paths;
    // deferred — see `.local/PRE_RELEASE_TODO.md` "Last priority —
    // research offline"). Already gitignored via `.gitignore` and
    // excluded from tsconfig.json; mirror here so oxlint doesn't
    // report the same lint violations on every check.
    "packages/*/src/**/*.d.ts",
    // Vendored Playwright serializer (Microsoft-licensed; per
    // AGENTS.md "Never: Modify
    // `packages/browser-cdp/src/internal/Page/Evaluate/serialization/`"
    // — changes here complicate upstream updates). Lint-cleaning these
    // is out of scope for the Effect-style rules.
    "packages/browser-cdp/src/internal/Page/Evaluate/serialization/**",
    "packages/browser-cdp/src/internal/Page/Util/browserSerializer.ts",
    // Browser / Worker context polyfills. Per ADR-0006 these files run
    // in the browser or worker runtime and cannot import `effect` (any
    // import becomes `__vite_ssr_import_0__.X` after Vite SSR, which
    // doesn't exist in browser eval context). The Effect-idiomatic
    // rules can't apply here.
    "packages/browser-stagehand/src/polyfills/ws.ts",
  ],

  // Rules from original config plus effect rule overrides
  rules: {
    // Original rules
    "import/no-relative-parent-imports": "error",
    "no-duplicate-imports": ["error", { allowSeparateTypeImports: true }],
    "typescript/consistent-type-imports": ["error", { fixStyle: "separate-type-imports" }],
    "unicorn/no-empty-file": "off",

    // 17 fully redundant with @effect/tsgo — disable
    "effect/avoid-direct-json": "off",
    "effect/avoid-native-fetch": "off",
    "effect/avoid-node-imports": "off",
    "effect/avoid-process-env": "off",
    "effect/avoid-try-catch": "off",
    "effect/avoid-untagged-errors": "off",
    "effect/avoid-yield-ref": "off",
    "effect/context-tag-extends": "off",
    "effect/effect-run-in-body": "off",
    "effect/prefer-effect-fn": "off",
    "effect/use-clock-service": "off",
    "effect/use-command-executor-service": "off",
    "effect/use-console-service": "off",
    "effect/use-filesystem-service": "off",
    "effect/use-http-client-service": "off",
    "effect/use-path-service": "off",
    "effect/use-random-service": "off",

    // 2 partially overlapping with tsgo — disable
    "effect/casting-awareness": "off",
    "effect/avoid-sync-fs": "off",

    // 3 stylistic/overly prescriptive — disable
    "effect/no-barrel-imports": "off",
    "effect/avoid-native-object-helpers": "off",
    "effect/imperative-loops": "off",

    /* prefer-option-over-null: Disabled because all flagged locations are:
     - External API boundaries (DOM, Playwright, CDP, Node.js AsyncLocalStorage)
     - Wire formats (SerializedValue for CDP serialization)
     - Hot paths (evaluation, serialization)
     - Test mocks mirroring real APIs
     - Type guards/extractors using T | undefined idiomatically
     None are internal business logic where Option's composability would help. */
    "effect/prefer-option-over-null": "off",

    // Additional disables per project preference
    "effect/prefer-namespace-imports": "off",

    /* 16 anti-slop rules added in @mpsuesser/oxlint-plugin-effect@0.5.0.
     Ported from `dmmulroy/anti-slop` — a generic (non-Effect) ruleset that
     both presets now enable by default, taking the rule count 57 → 73.
     Adopting them is a lint-policy decision, not a dependency bump: on this
     codebase they produce 1410 findings across 139 files, 73% of them
     `require-safety-comment-for-type-assertion` (1024). Not adopted here —
     revisit as its own policy migration. The other 57 rules are unchanged and
     pass clean. */
    "effect/no-chained-type-assertions": "off",
    "effect/no-conditional-empty-object-spread": "off",
    "effect/no-known-value-widening": "off",
    "effect/no-module-mocking": "off",
    "effect/no-object-parameters": "off",
    "effect/no-reflect-apply": "off",
    "effect/no-reflect-get": "off",
    "effect/no-runtime-typeof": "off",
    "effect/no-service-constructor-imports": "off",
    "effect/no-shape-in-symbol-names": "off",
    "effect/no-unknown-parameters": "off",
    "effect/no-unknown-returns": "off",
    "effect/no-unknown-type-aliases": "off",
    "effect/no-unsafe-dictionary-type": "off",
    "effect/no-widen-then-assert": "off",
    "effect/require-safety-comment-for-type-assertion": "off",

    // Removed in @mpsuesser/oxlint-plugin-effect@0.4.x — no longer needed.
    // "effect/prefer-schema-class": "off",
  },

  // Per-directory rule overrides
  overrides: [
    {
      files: ["packages/browser-providers/src/**"],
      rules: {
        // Providers need to import internal factories from other modules within the package
        "import/no-relative-parent-imports": "off",
      },
    },
    {
      files: ["packages/browser-cdp/src/**"],
      rules: {
        // Internal implementation files need relative imports to avoid barrel file circular deps
        "import/no-relative-parent-imports": "off",
      },
    },
    {
      files: ["packages/browser-cdp/src/internal/Page/**"],
      rules: {
        // Browser-executed callbacks — throw runs in browser, not Effect context
        "effect/throw-in-effect-gen": "off",
        // FrameExtensions.ts uses cast through unknown / any to bridge
        // between partial option types and locator method signatures
        // (filterDefined returns Partial<T> which is wider than the
        // exact shape the locator expects).
        "effect/avoid-any": "off",
        // evaluatePage/evaluateHandle arrows are serialized via .toString()
        // and run in the browser. Any import referenced inside the arrow
        // body would be SSR-bundled as __vite_ssr_import_0__ and throw
        // ReferenceError when evaluated under workerd. Use native JS
        // (typeof, Array.isArray, instanceof) inside evaluate-payload
        // arrows; reserve Predicate.isString et al for non-serialized
        // helper bodies. See decisions/0006-ssr-import-constraint.md.
        "effect/prefer-effect-is": "off",
      },
    },
    {
      files: ["packages/browser-cdp/src/internal/Page/Evaluate/serialization/**"],
      rules: {
        // Adapted from Microsoft Playwright — avoid changes to simplify upstream updates
        "effect/prefer-arr-match": "off",
        "effect/prefer-effect-is": "off",
      },
    },
    {
      files: ["packages/browser-playwright/src/internal/**"],
      rules: {
        // Internal implementation files need relative imports to avoid barrel file circular deps
        "import/no-relative-parent-imports": "off",
      },
    },
    {
      files: [
        "tests/{unit,integration,workerd,playground}/**",
        "tests/*.test.*",
        "tests/utils/**",
        "tests/setup/**",
      ],
      rules: {
        // Test mocks legitimately need `as any` for partial implementations
        "effect/avoid-any": "off",
        // Test assertions — throwing is valid in test setup/teardown
        "effect/throw-in-effect-gen": "off",
        // Sequential iteration in tests is acceptable
        "effect/yield-in-for-loop": "off",
        // Test fixtures often use non-null assertions for brevity
        "effect/avoid-non-null-assertion": "off",
        // Test data schemas don't need Schema.Class overhead
        // Removed in @mpsuesser/oxlint-plugin-effect@0.4.x
        // Test schemas often describe domain types, not Effect schemas
        "effect/avoid-schema-suffix": "off",
        // Module load tests want failures as defects, not typed errors
        "effect/effect-promise-vs-trypromise": "off",
        // Use Effect.catchTag, Predicate.isTagged, or Match.value instead of direct _tag checks
        // Tests use simpler array patterns for clarity
        "effect/prefer-arr-match": "off",
        // Tests use getOrThrow to fail fast on unexpected None
        "effect/avoid-option-getorthrow": "off",
        // Tests use raw numbers for Effect.sleep for brevity
        "effect/prefer-duration-constructors": "off",
        // Test utilities may use {} type for mock objects
        "effect/avoid-object-type": "off",
        // Tests may use blanket catch for error scenario testing
        "effect/effect-catchall-default": "off",
        // Tests use switch for error categorization and action handling
        "effect/prefer-match-over-switch": "off",
        // Tests use typeof checks for simple assertions
        "effect/prefer-effect-is": "off",
        // Tests and setup import CDP internal modules by relative path to test
        // implementation details (CdpConnection/CdpConfig/makePageHttpClient/etc.)
        // that are intentionally not part of the public @effect-libs/browser-cdp
        // surface — same pattern as providers importing playwright/internal.
        "import/no-relative-parent-imports": "off",
      },
    },
    {
      files: [
        "tests/integration/runtime/bun/**",
        "tests/integration/runtime/deno/**",
        "tests/integration/shared/**",
      ],
      rules: {
        // Bun and Deno don't support @test/* path aliases, must use relative imports
        "import/no-relative-parent-imports": "off",
      },
    },
    {
      files: ["examples/**"],
      rules: {
        // Examples use simpler patterns for clarity (matching official alchemy examples)
        "effect/effect-catchall-default": "off",
        "effect/avoid-non-null-assertion": "off",
        "effect/prefer-arr-match": "off",
        // Examples use sequential iteration for clarity (same rationale as scripts/**)
        "effect/yield-in-for-loop": "off",
      },
    },
    {
      files: ["scripts/**"],
      rules: {
        // Build scripts use sequential iteration for simplicity
        "effect/yield-in-for-loop": "off",
        // Scripts don't need Arr.match overhead
        "effect/prefer-arr-match": "off",
        // Scripts use simpler patterns for maintainability
        "effect/avoid-direct-tag-checks": "off",
        // Scripts may use blanket catch for error logging/cleanup
        "effect/effect-catchall-default": "off",
        // Scripts use native .sort() for simplicity
        "effect/prefer-arr-sort": "off",
        // Scripts use switch for runtime selection and action handling
        "effect/prefer-match-over-switch": "off",
      },
    },
    {
      files: ["scripts/test-runner/internal/**"],
      rules: {
        // Internal implementation files need relative parent imports to reach
        // the public TestRunner.ts — same pattern as packages/<name>/src/internal/**.
        "import/no-relative-parent-imports": "off",
      },
    },
    {
      files: ["scripts/examples/**", "scripts/docs/**"],
      rules: {
        // Import shared cross-cutting helpers from ../shared/{FileWalker,ProcessSpawner}.
        // Mirrors the scripts/test-runner/internal/** override above.
        "import/no-relative-parent-imports": "off",
      },
    },
    {
      files: ["scripts/test-runner/TestRunner.ts"],
      rules: {
        // Public test-runner entry point loads shared CLI helpers
        // (e.g. ../shared/CliFormat) — same justification as examples/docs.
        "import/no-relative-parent-imports": "off",
      },
    },
    {
      // HTTP response contract schemas. The `success: Schema.Boolean` field
      // is part of the public response shape returned to callers
      // (test infrastructure and the Stagehand workerd driver) — renaming
      // to `isSuccess` would be a breaking change to the wire contract.
      // The rule's "boolean fields should be prefixed" preference applies
      // to internal Effect schemas, not to HTTP response envelopes.
      files: [
        "tests/setup/http-server/Admin.ts",
        "tests/integration/runtime/workerd/stagehand/driver.ts",
      ],
      rules: {
        "effect/require-is-prefix-for-boolean-schema-field": "off",
      },
    },
  ],
});
