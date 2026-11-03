import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Plugin } from 'vite';

// Development-only static references. No HID access, commands or production assets.
export function benchFilesPlugin(): Plugin {
  const allowed = new Set(['/baseline.json', '/current.json', '/polling-baseline.json', '/polling-current.json']);
  return {
    name: 'rapoo-bench-files', apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/bench', async (request, response) => {
        response.setHeader('Content-Type', 'application/json; charset=utf-8');
        response.setHeader('Cache-Control', 'no-store');
        if (request.method !== 'GET' && request.method !== 'HEAD') {
          response.statusCode = 405; response.setHeader('Allow', 'GET, HEAD');
          response.end(JSON.stringify({error: 'Bench references are read-only'})); return;
        }
        const file = request.url?.split('?')[0] ?? '';
        if (!allowed.has(file)) {
          response.statusCode = 404; response.end(JSON.stringify({error: 'Unknown bench reference'})); return;
        }
        try {
          const content = await readFile(join(server.config.root, '.bench', file.slice(1)), 'utf8');
          JSON.parse(content);
          response.end(request.method === 'HEAD' ? undefined : content);
        } catch (error) {
          response.statusCode = (error as NodeJS.ErrnoException).code === 'ENOENT' ? 404 : 500;
          response.end(JSON.stringify({error: 'Prepare a fresh native bench reference'}));
        }
      });
    },
  };
}
