import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Use 127.0.0.1 (not "localhost") in proxy targets. On Windows + Node 17+, "localhost"
    // resolves to IPv6 ::1 first, but uvicorn's default IPv4 bind doesn't accept that.
    // Pointing at 127.0.0.1 sidesteps the dual-stack mismatch.
    proxy: {
      "/api": "http://127.0.0.1:8000",
      "/ws": { target: "ws://127.0.0.1:8000", ws: true },
    },
  },
});
