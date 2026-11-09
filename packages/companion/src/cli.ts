import { Command } from 'commander';
import qrcode from 'qrcode-terminal';
import { createCompanion } from './companion';
import { ConfigStore, defaultConfigDir, defaultWorkspace } from './config';
import { initWorkspace } from './workspace';
import path from 'node:path';

const program = new Command();
program
  .name('kesh')
  .description('Kesh Mac companion')
  .option('--workspace <dir>', 'workspace directory', defaultWorkspace())
  .option('--port <n>', 'listen port (default: random free port)', (v) => parseInt(v, 10))
  .option('--config-dir <dir>', 'config directory', defaultConfigDir());

program.command('init').description('create the workspace').action(() => {
  const o = program.opts();
  const r = initWorkspace(path.resolve(o.workspace));
  console.log(`${r.created ? 'Created' : 'Workspace exists'}: ${path.resolve(o.workspace)}${r.usedTemplate ? '' : ' (placeholder CLAUDE.md; sdk template not found)'}`);
});

program.command('unpair').description('forget all paired devices').action(() => {
  new ConfigStore(program.opts().configDir).clear();
  console.log('All paired devices removed.');
});

program.action(async () => {
  const o = program.opts();
  const c = createCompanion({ workspace: o.workspace, port: o.port, configDir: o.configDir });
  const ts = () => new Date().toLocaleTimeString();
  const say = (s: string) => console.log(`[${ts()}] ${s}`);
  c.on('device-connected', (n, paired) => say(`device connected: ${n}${paired ? ' (newly paired)' : ''}`));
  c.on('device-disconnected', (n) => say(`device disconnected: ${n}`));
  c.on('plugin-built', (p) => say(`built ${p.manifest.id} v${p.manifest.version} (${p.hash.slice(0, 8)})`));
  c.on('build-error', (id, e) => say(`BUILD ERROR in ${id} (keeping last good bundle):\n${e}`));
  c.on('icon-warning', (id, r) => say(`WARNING plugin ${id}: ${r} (shipping without icon)`));
  c.on('pushed', (id, v, n) => say(`pushed ${id} v${v} to ${n} device(s)`));
  c.on('plugin-removed', (id) => say(`removed ${id}`));
  c.on('ack', (m, d) => say(`ack ${m.id} v${m.version}: ${m.status}${m.error ? ` (${m.error})` : ''} [${d}]`));
  c.on('log', (m, d) => say(`[${d}] ${m.id} ${m.level}: ${m.message}`));
  c.on('ai-done', (i) => say(`ai ${i.pluginId} ${i.model} ${i.ms}ms ${i.ok ? 'ok' : `error: ${i.error}`}`));
  c.on('rejected', (r) => say(`rejected: ${r}`));
  let info;
  try {
    info = await c.start();
  } catch (e) {
    console.error(`Failed to start: ${(e as Error).message}`);
    process.exit(1);
  }
  console.log('\nScan this QR code in the Kesh app:\n');
  qrcode.generate(info.url, { small: true });
  console.log(`\nPairing URL: ${info.url}`);
  console.log(`Workspace:   ${info.workspace}`);
  console.log(`\nNext: cd ${info.workspace} && claude\n`);
  say(c.claudeAvailable ? 'Claude Code found: AI models enabled for plugins with the ai permission' : 'Claude Code not found: ai requests will fail (install it and run claude /login)');
  say('waiting for devices...');
  const quit = async () => {
    await c.stop();
    process.exit(0);
  };
  process.on('SIGINT', quit);
  process.on('SIGTERM', quit);
});

program.parseAsync();
