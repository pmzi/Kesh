import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

const PLACEHOLDER = `# Kesh workspace

You are writing React Native plugins for the Kesh iPhone app.
Each plugin lives in plugins/<id>/ with manifest.json and index.tsx (default-export a React component).
Imports allowed: react, react-native, @kesh/sdk. The companion bundles on save and pushes to the phone.
manifest.json: { "id": "<id>", "name": "...", "description": "...", "permissions": [] }
permissions subset of: haptics, storage, clipboard, notifications, ai.
`;

export function findTemplate(): string | undefined {
  for (const p of [path.join(here, '../template'), path.join(here, '../../sdk/template'), path.join(here, '../../../sdk/template')]) {
    if (fs.existsSync(p)) return p;
  }
  return undefined;
}

/** Create the workspace, copying the template without overwriting existing files. */
export function initWorkspace(ws: string): { created: boolean; usedTemplate: boolean } {
  const created = !fs.existsSync(ws);
  fs.mkdirSync(path.join(ws, 'plugins'), { recursive: true });
  const tpl = findTemplate();
  if (tpl) {
    fs.cpSync(tpl, ws, {
      recursive: true,
      force: false,
      errorOnExist: false,
      filter: (src) => !src.split(path.sep).includes('node_modules'),
    });
    return { created, usedTemplate: true };
  }
  const claude = path.join(ws, 'CLAUDE.md');
  if (!fs.existsSync(claude)) fs.writeFileSync(claude, PLACEHOLDER);
  return { created, usedTemplate: false };
}
