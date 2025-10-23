import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      // qrandom (dice)
      '/qrand': {
        target: 'https://qrandom.io',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/qrand/, ''),
      },
      // drand (board randomness)
      '/drand': {
        target: 'https://api.drand.sh',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/drand/, ''),
      },
    },
  },
});
