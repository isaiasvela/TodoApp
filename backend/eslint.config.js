import globals from "globals";

export default [
  { ignores: ["node_modules/**", "coverage/**"] },
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: { ...globals.node },
    },
    rules: {
      "no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "no-undef": "error",
      eqeqeq: ["error", "always"],
    },
  },
  {
    files: ["tests/**/*.js"],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
];
