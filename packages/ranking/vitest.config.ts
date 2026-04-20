import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "ranking",
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
