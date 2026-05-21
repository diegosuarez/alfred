import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    // Personal-dev stack reached over Tailscale, LAN names, etc. — the
    // built-in localhost-only allowlist gets in the way. Disable the host
    // check entirely; not something to ship to a real deployment.
    allowedHosts: true,
  },
})
