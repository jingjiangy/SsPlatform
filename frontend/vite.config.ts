import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function devHttps(): { key: Buffer; cert: Buffer } | undefined {
  const keyPath = path.join(__dirname, "certs", "localhost-key.pem");
  const certPath = path.join(__dirname, "certs", "localhost-cert.pem");
  try {
    if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
      return { key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) };
    }
  } catch {}
  return undefined;
}

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  server: {
    host: true,
    port: 5173,
    https: devHttps(),
    proxy: {
      "/api": { target: "http://127.0.0.1:8077", changeOrigin: true },
      "/static": { target: "http://127.0.0.1:8077", changeOrigin: true },
      "/docs": { target: "http://127.0.0.1:8077", changeOrigin: true },
      "/redoc": { target: "http://127.0.0.1:8077", changeOrigin: true },
      "/openapi.json": { target: "http://127.0.0.1:8077", changeOrigin: true },
    },
  },
});
