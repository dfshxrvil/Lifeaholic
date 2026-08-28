const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  ...expoConfig,
  {
    settings: {
      'import/resolver': {
        node: { extensions: ['.js', '.jsx', '.ts', '.tsx'] },
      },
    },
    // Node 24 on Windows cannot load the optional native resolver bundled by
    // eslint-import-resolver-typescript. TypeScript performs module resolution
    // in the typecheck script, so keep the non-resolver import rules here.
    rules: {
      'import/no-unresolved': 'off',
      'import/named': 'off',
      'import/namespace': 'off',
      'import/default': 'off',
      'import/export': 'off',
      'import/no-named-as-default': 'off',
      'import/no-named-as-default-member': 'off',
      'import/no-duplicates': 'off',
      // Data-loading effects intentionally set loading/error state around
      // asynchronous Supabase and Google API requests.
      'react-hooks/set-state-in-effect': 'off',
    },
  },
]);
