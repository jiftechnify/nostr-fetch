/** @type {import('eslint').Linter.Config} */
const config = {
  env: {
    node: true,
    es2021: true,
  },
  ignorePatterns: [".eslintrc.js"],
  extends: ["eslint:recommended", "prettier"],
  parser: "@typescript-eslint/parser",
  plugins: ["@typescript-eslint"],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "prettier",
  ],
  rules: {
    "no-constant-condition": ["error", { checkLoops: false }],
  },
};

module.exports = config;
