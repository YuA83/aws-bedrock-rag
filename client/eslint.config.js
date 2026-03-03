const js = require("@eslint/js");

module.exports = [
  {
    ignores: ["node_modules/**", "public/**", "**/*.ejs"],
  },
  {
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: 2021,
      globals: {
        require: "readonly",
        module: "writable",
        exports: "writable",
        __dirname: "readonly",
        __filename: "readonly",
        process: "readonly",
        console: "readonly",
        setTimeout: "readonly",
        setInterval: "readonly",
        clearTimeout: "readonly",
        clearInterval: "readonly",
      },
    },
    rules: {
      "prefer-const": "error",
      "no-var": "error",
      "no-unused-vars": "warn",
      "no-console": "off",
      "eqeqeq": "error",
      "no-duplicate-imports": "error",
      "no-return-await": "warn",
      "require-await": "warn",
      "no-throw-literal": "error",
    },
  },
];