import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // served from https://yago1994.github.io/goya/, so assets need the repo
  // path as their base; dev and preview stay at the root
  base: process.env.GITHUB_PAGES ? '/goya/' : '/',
  server: {
    port: 5183,
  },
})
