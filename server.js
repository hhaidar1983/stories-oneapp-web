import { createServer } from 'http';
import { readFile, stat } from 'fs/promises';
import { join, extname, normalize } from 'path';

const DIST = join(process.cwd(), 'dist');
const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.map': 'application/json', '.webmanifest': 'application/manifest+json',
};

async function send(res, path, status = 200) {
  const data = await readFile(path);
  res.writeHead(status, { 'Content-Type': TYPES[extname(path)] || 'application/octet-stream' });
  res.end(data);
}

createServer(async (req, res) => {
  try {
    const url = decodeURIComponent((req.url || '/').split('?')[0]);
    let path = normalize(join(DIST, url));
    if (!path.startsWith(DIST)) { res.writeHead(403); return res.end('Forbidden'); }
    try {
      const s = await stat(path);
      await send(res, s.isDirectory() ? join(path, 'index.html') : path);
    } catch {
      await send(res, join(DIST, 'index.html')); // SPA fallback
    }
  } catch {
    res.writeHead(500); res.end('Server error');
  }
}).listen(PORT, '0.0.0.0', () => console.log('[web] serving dist on :' + PORT));
