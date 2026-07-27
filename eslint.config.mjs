import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import nextPlugin from '@next/eslint-plugin-next';
import reactPlugin from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y';

/**
 * Native flat config rather than FlatCompat + eslint-config-next: the compat
 * shim couples us to matching major versions of eslint-config-next and
 * @next/eslint-plugin-next, and silently explodes when they drift.
 *
 * The load-bearing rule here is the `lib/**` purity rule. All Road360 business
 * logic lives in `lib/` as plain TypeScript so it can be reused from Capacitor
 * or React Native with only the capture layer rewritten. Importing React or
 * Next from `lib/` would quietly destroy that property, so it fails lint rather
 * than merely failing review.
 */
export default tseslint.config(
  {
    ignores: [
      '.next/**',
      'out/**',
      'node_modules/**',
      'public/sw.js',
      'public/sw.js.map',
      'public/swe-worker-*.js',
      'public/worklets/**',
      'next-env.d.ts',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    files: ['**/*.{ts,tsx,mjs}'],
    languageOptions: {
      ecmaVersion: 2023,
      globals: { ...globals.browser, ...globals.node, ...globals.serviceworker },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: {
      '@next/next': nextPlugin,
      react: reactPlugin,
      'react-hooks': reactHooks,
      'jsx-a11y': jsxA11y,
    },
    settings: { react: { version: 'detect' } },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
      ...reactPlugin.configs.flat.recommended.rules,
      ...jsxA11y.flatConfigs.recommended.rules,

      // The classic Rules of Hooks, without the React Compiler's purity and
      // set-state-in-effect rules. Those are the `recommended-latest` preset and
      // assume the compiler is in use; this app is not compiled, and they flag
      // legitimate patterns (the SSR mount-guard, Date.now() in a tap handler).
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',

      // The new JSX transform makes both of these obsolete.
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',

      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },

  {
    files: ['lib/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'react',
              message:
                'lib/ must stay framework-agnostic so it can be reused in Capacitor / React Native. Put React code in hooks/ or components/.',
            },
            {
              name: 'react-dom',
              message: 'lib/ must stay framework-agnostic. Put React code in hooks/ or components/.',
            },
            {
              name: 'framer-motion',
              message: 'lib/ must stay framework-agnostic. Animation belongs in components/.',
            },
            {
              name: 'leaflet',
              message: 'lib/ must stay framework-agnostic. Map bindings belong in components/map/.',
            },
          ],
          patterns: [
            {
              group: ['next', 'next/*'],
              message: 'lib/ must stay framework-agnostic. Next-specific code belongs in app/.',
            },
            {
              group: ['@/hooks/*', '@/components/*', '@/app/*'],
              message: 'lib/ must not depend on the UI layer — dependencies point inward only.',
            },
          ],
        },
      ],
    },
  },

  {
    // The only sanctioned places that may touch browser APIs directly. Both are
    // reached exclusively through interfaces (`SensorSource`, the platform
    // adapters), which is what keeps a native port to a rewrite of these files.
    files: ['lib/sensors/web/**/*.ts', 'lib/platform/**/*.ts'],
    rules: { 'no-restricted-imports': 'off' },
  },

  {
    files: ['tests/**/*.ts', 'scripts/**/*.mjs', 'vitest.config.ts'],
    rules: { '@typescript-eslint/no-explicit-any': 'off' },
  },
);
