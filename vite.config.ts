import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

type ProxyOutgoing = {
  writeHead?: (
    code: number,
    hdrs?: Record<string, string | number | readonly string[]>
  ) => void;
  end?: (chunk?: string | Buffer) => void;
  headersSent?: boolean;
};

/** When the API isn't listening, return JSON instead of a confusing HTML proxy error. */
function safeProxyFailure(res: unknown) {
  const r = res as ProxyOutgoing | undefined;
  if (typeof r?.writeHead === "function" && !r.headersSent) {
    try {
      r.writeHead(503, { "Content-Type": "application/json" });
      r.end?.(JSON.stringify({ error: "backend_unavailable", backend: "http://localhost:3847" }));
    } catch {
      /* ignored */
    }
  }
}

export default defineConfig(({ mode }) => ({
  define: { 'import.meta.env.VITE_LOCAL_SNAPSHOT': JSON.stringify(loadEnv(mode, process.cwd(), 'VITE_').VITE_LOCAL_SNAPSHOT || '1') },
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    strictPort: true,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:3847",
        changeOrigin: true,
        configure(proxy) {
          proxy.on("error", (_err, _req, res) => {
            safeProxyFailure(res);
          });
        }
      }
    }
  }
}));
