// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Evita que o Vite empacote duas cópias de react/react-dom
export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
  server: {
    port: 5173,
  },
  build: {
    outDir: 'dist',
  },
})
