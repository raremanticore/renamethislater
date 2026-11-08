import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const python = fileURLToPath(new URL(process.platform === 'win32' ? '../agents/.venv/Scripts/python.exe' : '../agents/.venv/bin/python', import.meta.url));
if (!existsSync(python)) {
  console.error('Install the optional agent environment first; see agents/README.md.');
  process.exit(1);
}
const child = spawn(python, ['-u', 'agents/collector.py', ...process.argv.slice(2)], { cwd: root, stdio: 'inherit', windowsHide: false });
const deadline = setTimeout(() => { console.error('Collector process time limit reached; stopping.'); child.kill(); }, 150_000);
child.on('error', () => { clearTimeout(deadline); console.error('Could not start the collector.'); process.exitCode = 1; });
child.on('exit', code => { clearTimeout(deadline); process.exitCode = code ?? 1; });
process.on('SIGINT', () => child.kill());
process.on('SIGTERM', () => child.kill());
