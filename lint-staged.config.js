export default {
  '*.{js,jsx,ts,tsx}': ['eslint --fix --max-warnings 0 --no-warn-ignored', 'prettier --write'],
  '*.{json,jsonc,css,html,md,yml,yaml}': 'prettier --write',
};
