export default [
  {
    files: ["server/**/*.ts", "client/**/*.ts", "client/**/*.tsx"],
    rules: {
      "no-console": ["error", { allow: ["warn", "error"] }],
    },
  },
  {
    files: ["tests/**/*.ts", "scripts/**/*", "lib/logger.ts"],
    rules: {
      "no-console": "off",
    },
  },
];
