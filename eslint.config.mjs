import { base } from "@cresium/eslint-config";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["node_modules/**", "coverage/**"] },
  ...base,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/switch-exhaustiveness-check": "error",
      "@typescript-eslint/restrict-template-expressions": [
        "error",
        { allowNumber: true },
      ],
    },
  },
  {
    files: ["**/*.mjs"],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    files: ["scripts/**/*.ts"],
    rules: { "no-console": "off" },
  },
  {
    files: ["test/**/*.ts", "**/*.test.ts"],
    rules: {
      "max-lines": "off",
    },
  },
);
