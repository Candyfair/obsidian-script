import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// In dev mode, the Vite dev server proxies /api requests to the Express
// server (default port 4242, see server/api.js). In production, the
// Express server itself serves the built dist/ folder, so no proxy is
// needed there.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": "http://localhost:4242",
    },
  },
});
