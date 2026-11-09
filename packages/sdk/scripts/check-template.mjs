// Validates template manifests against the protocol Permission list, syncs sdk types
// into template/types, and type-checks the template with tsc.
import { readFileSync, readdirSync, existsSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const proto = readFileSync(join(root, '../protocol/src/index.ts'), 'utf8');
const m = proto.match(/export type Permission\s*=\s*([^;]+);/);
if (!m) throw new Error('Permission type not found in protocol');
const allowed = [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);

copyFileSync(join(root, 'src/index.d.ts'), join(root, 'template/types/kesh-sdk.d.ts'));

// icon.svg allowlist (mirrors the companion sanitizer): streaming tag/attribute scan.
const SVG_EL = new Set('svg g defs linearGradient radialGradient stop clipPath mask path circle ellipse rect line polyline polygon'.split(' '));
const SVG_ATTR = new Set('viewBox width height x y cx cy r rx ry x1 y1 x2 y2 d points fill fill-opacity fill-rule clip-rule stroke stroke-width stroke-opacity stroke-linecap stroke-linejoin stroke-miterlimit stroke-dasharray stroke-dashoffset opacity transform offset stop-color stop-opacity id clip-path mask gradientUnits gradientTransform xmlns'.split(' '));
function checkIcon(id, svg) {
  const out = [];
  if (Buffer.byteLength(svg) > 3500) out.push(`${id}: icon.svg over ~3 KB`);
  if (/<!|<\?(?!xml)|&/.test(svg.replace(/^<\?xml[^>]*\?>/, ''))) out.push(`${id}: icon.svg has DOCTYPE/entity/PI`);
  const tags = [...svg.matchAll(/<(\/?)([A-Za-z][\w:-]*)([^>]*?)(\/?)>/g)];
  if (!tags.length || tags[0][2] !== 'svg') out.push(`${id}: icon.svg root must be <svg>`);
  const roots = tags.filter((t) => t[2] === 'svg' && !t[1]).length;
  if (roots !== 1) out.push(`${id}: icon.svg needs exactly one <svg>`);
  const first = tags.find((t) => t[2] !== 'svg' && t[2] !== 'defs' && t[2] !== 'linearGradient' && t[2] !== 'radialGradient' && t[2] !== 'stop' && !t[1]);
  if (!first || first[2] !== 'rect') out.push(`${id}: icon.svg first drawn element must be the background <rect>`);
  for (const [, close, name, attrs] of tags) {
    if (!SVG_EL.has(name)) { out.push(`${id}: icon.svg element <${name}> not allowed`); continue; }
    if (close) continue;
    for (const [, an, , av] of attrs.matchAll(/([\w:-]+)\s*=\s*(["'])(.*?)\2/g).map((x) => [x[0], x[1], x[2], x[3]])) {
      if (!SVG_ATTR.has(an)) out.push(`${id}: icon.svg attribute "${an}" not allowed on <${name}>`);
      if (/url\(/i.test(av) && !/^url\(#[\w-]+\)$/.test(av.trim())) out.push(`${id}: icon.svg external/odd url() in ${an}`);
      if (/^(https?:|data:|javascript:)/i.test(av.trim()) && an !== 'xmlns') out.push(`${id}: icon.svg external ref in ${an}`);
    }
  }
  if (!/viewBox="0 0 120 120"/.test(svg)) out.push(`${id}: icon.svg viewBox must be "0 0 120 120"`);
  return out;
}

const errors = [];
const pdir = join(root, 'template/plugins');
for (const id of readdirSync(pdir)) {
  const mf = join(pdir, id, 'manifest.json');
  if (!existsSync(mf)) { errors.push(`${id}: manifest.json missing`); continue; }
  if (!existsSync(join(pdir, id, 'index.tsx'))) errors.push(`${id}: index.tsx missing`);
  const ic = join(pdir, id, 'icon.svg');
  if (existsSync(ic)) errors.push(...checkIcon(id, readFileSync(ic, 'utf8')));
  else errors.push(`${id}: icon.svg missing`);
  const man = JSON.parse(readFileSync(mf, 'utf8'));
  if (man.id !== id) errors.push(`${id}: manifest id "${man.id}" != folder`);
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(man.id)) errors.push(`${id}: id not kebab-case`);
  if ('version' in man) errors.push(`${id}: manifest must not have version`);
  for (const k of ['name', 'description']) if (typeof man[k] !== 'string' || !man[k]) errors.push(`${id}: bad ${k}`);
  if (!Array.isArray(man.permissions)) errors.push(`${id}: permissions must be array`);
  else for (const p of man.permissions) if (!allowed.includes(p)) errors.push(`${id}: unknown permission "${p}"`);
  const src = readFileSync(join(pdir, id, 'index.tsx'), 'utf8');
  for (const p of allowed) {
    const used = new RegExp(`\\b${p}\\.[a-zA-Z]+\\(`).test(src);
    const declared = man.permissions?.includes(p);
    if (used && !declared) errors.push(`${id}: uses ${p} but does not declare it`);
    if (declared && !used) errors.push(`${id}: declares ${p} but never uses it`);
  }
}
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
console.log(`manifests ok (permissions: ${allowed.join(', ')})`);

const tsc = join(root, 'node_modules/.bin/tsc');
const r = spawnSync(existsSync(tsc) ? tsc : 'npx', existsSync(tsc) ? ['--noEmit', '-p', join(root, 'template')] : ['tsc', '--noEmit', '-p', join(root, 'template')], { stdio: 'inherit' });
if (r.status !== 0) process.exit(r.status ?? 1);
console.log('tsc ok');
