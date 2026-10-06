/** @type {import('prettier').Config & import('@ianvs/prettier-plugin-sort-imports').PluginConfig & import('prettier-plugin-tailwindcss').PluginOptions} */
export default {
  singleQuote: true,
  semi: true,
  trailingComma: 'all',
  printWidth: 100,
  plugins: ['@ianvs/prettier-plugin-sort-imports', 'prettier-plugin-tailwindcss'],
  importOrder: [
    '<BUILTIN_MODULES>',
    '',
    '^react$',
    '^react-dom(/.*)?$',
    '',
    '<THIRD_PARTY_MODULES>',
    '',
    '^@/',
    '',
    '^[.]',
  ],
  importOrderTypeScriptVersion: '6.0.3',
  tailwindStylesheet: './src/index.css',
};
