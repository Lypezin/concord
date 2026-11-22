import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const devUrl = 'http://localhost:5173';

async function waitForServer(url, timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // still booting
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Tempo esgotado aguardando ${url}`);
}

await waitForServer(devUrl);

const electronBinary = require('electron');
const child = spawn(electronBinary, ['.'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    VITE_DEV_SERVER_URL: devUrl,
  },
});

child.on('exit', (code) => {
  process.exit(code ?? 0);
});
