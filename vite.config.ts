import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Base path is set from an env var injected by the GitHub Actions workflow so
// this works both at localhost (base "/") and on GitHub Pages at
// https://<user>.github.io/<repo>/ (base "/<repo>/"). Set VITE_BASE_PATH as a
// repo variable if your repo name differs from the default below.
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE_PATH || '/',
})
