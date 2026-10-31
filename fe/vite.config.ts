import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { headers: { 'Cross-Origin-Opener-Policy': 'same-origin-allow-popups' } },
  preview: { headers: { 'Cross-Origin-Opener-Policy': 'same-origin-allow-popups' } },
})
