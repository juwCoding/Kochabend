import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { viteSingleFile } from 'vite-plugin-singlefile'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), viteSingleFile({ removeViteModuleLoader: true })],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    // Ensure all assets are inlined or bundled for offline use
    rollupOptions: {
      output: {
        manualChunks: undefined, // Single bundle for simplicity
      },
    },
    // Increase chunk size warning limit since we want a single bundle
    chunkSizeWarningLimit: 1000,
  },
  base: './', // Use relative paths for offline compatibility
})
