import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    exclude: ["ui/**", "**/node_modules/**", "**/dist/**"],
    coverage: {
      reporter: ["text", "json-summary"]
    }
  }
});
