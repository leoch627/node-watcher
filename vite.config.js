const { defineConfig } = require('vite');
const react = require('@vitejs/plugin-react').default;
const tailwindcss = require('@tailwindcss/vite').default;
const path = require('path');

module.exports = defineConfig({
  root: path.resolve(__dirname, 'client'),
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(__dirname, 'client/src') } },
  build: {
    outDir: path.resolve(__dirname, 'public'),
    emptyOutDir: true
  },
  server: {
    proxy: { '/api': 'http://127.0.0.1:3000' }
  }
});
