import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://arapblog.com",
  output: "static",
  trailingSlash: "never",
  build: {
    format: "directory",
  },
});
