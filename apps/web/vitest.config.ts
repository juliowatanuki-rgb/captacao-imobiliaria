import { defineConfig } from "vitest/config";

export default defineConfig({
  define: {
    "import.meta.env.VITE_API_URL": JSON.stringify("http://localhost:3000"),
  },
  test: {
    environment: "jsdom",
  },
});
