// Static SPA build for GitHub Pages (https://vardhan23v.github.io/logic-link/).
// The default vite.config.ts stays the Lovable/Cloudflare build; this config
// is only used by `npm run build:pages`.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  nitro: false,
  tanstackStart: {
    spa: { enabled: true },
    router: { basepath: "/logic-link" },
  },
  vite: {
    base: "/logic-link/",
  },
});
