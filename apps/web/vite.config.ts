import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
import { benchFilesPlugin } from './bench-files';

export default defineConfig({
  plugins: [tailwindcss(), benchFilesPlugin()],
  // Bench snapshots change between a write and verification. Reloading loses the HID session.
  server: { watch: { ignored: ['**/.bench/**', '**/public/bench/**', '**/research/captures/**'] } },
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
});
