import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Where /api/* gets proxied during dev. Inside docker compose the backend
// service is reachable as http://backend:8000. Outside docker, override
// with VITE_PROXY_TARGET=http://localhost:30004 (or wherever uvicorn is).
const proxyTarget = process.env.VITE_PROXY_TARGET || 'http://backend:8000'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    // Reached over Tailscale / LAN — the built-in localhost-only allowlist
    // gets in the way. Not something to ship to a real deployment.
    allowedHosts: true,
    proxy: {
      '/api': {
        target: proxyTarget,
        changeOrigin: true,
        // Tailscale serves over HTTPS but proxies plain HTTP into the host,
        // so keep secure off here.
        secure: false,
      },
    },
  },
})
