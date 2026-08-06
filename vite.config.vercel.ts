// Static SPA build for Vercel (served from root /).
// The default vite.config.ts stays the Lovable/Cloudflare build; this config
// is only used by `npm run build:vercel`.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  nitro: false,
  tanstackStart: {
    spa: { enabled: true },
    router: { basepath: "/" },
  },
  vite: {
    base: "/",
  },
});