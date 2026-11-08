import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const backend = fileURLToPath(new URL('../backend/', import.meta.url));
const port = (name, fallback) => {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isSafeInteger(value) || value < 1 || value > 65535) throw new Error(`Invalid ${name}`);
  return value;
};
const frontendPort = port('FRONTEND_PORT', 3000);
const backendPort = port('BACKEND_PORT', 3001);
const origin = `http://localhost:${frontendPort}`;
const children = [];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const child of children) child.kill();
}
function launch(args, cwd, extraEnv) {
  const child = spawn(process.execPath, args, { cwd, env: { ...process.env, ...extraEnv }, stdio: 'inherit', windowsHide: true });
  children.push(child);
  child.on('error', () => { console.error('Unable to start the combined demo.'); stop(1); });
  child.on('exit', code => { if (!stopping) stop(code ?? 1); });
}
console.log(`Banking and security dashboard: ${origin}`);
console.log('Stop old servers on the selected ports before starting this combined demo.');
launch([`--env-file-if-exists=${process.env.BACKEND_ENV_FILE ?? '.env'}`, 'src/server.ts'], backend, { HOST: '127.0.0.1', PORT: String(backendPort), APP_ORIGIN: origin });
launch(['node_modules/next/dist/bin/next', 'dev', '--hostname', 'localhost', '--port', String(frontendPort)], root,
  { BACKEND_URL: `http://127.0.0.1:${backendPort}` });
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
