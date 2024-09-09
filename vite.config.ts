import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false, // Set to true if you need source maps in production
    minify: 'terser', // Use Terser for minification
    rollupOptions: {
      output: {
        manualChunks: undefined,
      },
    },
  },
})