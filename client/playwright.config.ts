import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "src",
  testMatch: /.*\.spec\.ts/,
  use: {
    baseURL: "http://localhost:3000",
  },
});
