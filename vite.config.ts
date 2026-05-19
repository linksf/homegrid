import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react({
      // Domain modules are plain TS — keep them out of the React refresh graph.
      exclude: [/node_modules/, /src\/domain\//],
    }),
  ],
  server: {
    port: 5173,
    strictPort: true,
  },
})
