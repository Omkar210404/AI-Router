import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// `npm run build:demo` builds the static GitHub Pages demo into dist-demo/.
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  base: mode === 'demo' ? '/AI-Router/' : '/',
  build: { outDir: mode === 'demo' ? 'dist-demo' : 'dist' },
  server: { proxy: { '/api': 'http://127.0.0.1:8400' } },
}))
