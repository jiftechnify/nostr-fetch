/** @type {import('eslint').Linter.Config} */
const config = {
  env: {
    node: true,
    es2021: true,
  },
  parserOptions: {
    sourceType: "module",
  },
  ignorePatterns: [".eslintrc.js"],
  extends: ["eslint:recommended", "prettier"],
  overrides: [
    {
      files: ["**/*.ts"],
      parser: "@typescript-eslint/parser",
      plugins: ["@typescript-eslint"],
      extends: [
        "eslint:recommended",
        "plugin:@typescript-eslint/recommended",
        "prettier",
      ],
    },
  ],
  rules: {
    "no-constant-condition": ["error", { checkLoops: false }],
  },
};

module.exports = config;
