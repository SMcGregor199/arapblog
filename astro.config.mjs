import netlify from "@astrojs/netlify";
import react from "@astrojs/react";
import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://arapblog.com",
  output: "static",
  adapter: netlify(),
  integrations: [react()],
  trailingSlash: "never",
  build: {
    format: "directory",
  },
});
