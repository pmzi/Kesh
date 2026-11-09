import { XMLParser, XMLValidator } from 'fast-xml-parser';

export const MAX_ICON_BYTES = 24 * 1024;
const MAX_DEPTH = 24;
const MAX_ELEMENTS = 1000;
const SVG_NS = 'http://www.w3.org/2000/svg';

const ELEMENTS = new Set([
  'svg', 'g', 'defs', 'linearGradient', 'radialGradient', 'stop', 'clipPath', 'mask',
  'path', 'circle', 'ellipse', 'rect', 'line', 'polyline', 'polygon',
]);

const ATTRS = new Set([
  'viewBox', 'width', 'height', 'x', 'y', 'cx', 'cy', 'r', 'rx', 'ry', 'x1', 'y1', 'x2', 'y2', 'd', 'points',
  'fill', 'fill-opacity', 'fill-rule', 'clip-rule', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-linecap',
  'stroke-linejoin', 'stroke-miterlimit', 'stroke-dasharray', 'stroke-dashoffset', 'opacity', 'transform', 'offset',
  'stop-color', 'stop-opacity', 'id', 'clip-path', 'mask', 'gradientUnits', 'gradientTransform', 'xmlns',
]);

/** Elements that get a specific error message (everything else unknown is rejected generically). */
const FORBIDDEN = /^(script|foreignobject|image|use|style|text|tspan|textpath|a|animate\w*|set|iframe|object|embed|switch|filter|pattern|marker|symbol|view|cursor|title|desc|metadata)$/;

type Result = { ok: true; svg: string } | { ok: false; error: string };
const fail = (error: string): Result => ({ ok: false, error });

class Reject extends Error {}
const reject = (m: string): never => {
  throw new Reject(m);
};

type Node = Record<string, unknown>;

function checkValue(attr: string, v: string) {
  // no entities / markup / control chars in values: nothing legitimate needs them
  if (v.includes('&')) reject(`attribute ${attr} contains an entity reference`);
  if (v.includes('<')) reject(`attribute ${attr} contains markup`);
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v)) reject(`attribute ${attr} contains control characters`);
  for (const m of v.matchAll(/url\s*\(([^)]*)\)?/gi)) {
    if (!/^#[A-Za-z0-9_.:-]+$/.test(m[1]!.trim()) || !/^url\(#[A-Za-z0-9_.:-]+\)$/.test(m[0].trim())) {
      reject(`attribute ${attr} has a url() that is not a same-document #fragment`);
    }
  }
}

function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function parseViewBox(v: string): [number, number, number, number] {
  const p = v.trim().split(/[\s,]+/).map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isFinite(n))) return reject('viewBox must be four numbers');
  const [x, y, w, h] = p as [number, number, number, number];
  if (w <= 0 || h <= 0) return reject('viewBox must have positive width and height');
  const ratio = w / h;
  if (ratio < 0.8 || ratio > 1.25) return reject('viewBox must be roughly square');
  return [x, y, w, h];
}

function num(v: string | undefined): number | undefined {
  if (v === undefined) return undefined;
  const m = /^\s*([0-9]*\.?[0-9]+)\s*(px)?\s*$/.exec(v);
  return m ? Number(m[1]) : undefined;
}

/** Returns a sanitized, re-serialized SVG built only from allowlisted elements and attributes, or an error. */
export function sanitizeIcon(svgText: string): Result {
  try {
    return run(svgText);
  } catch (e) {
    if (e instanceof Reject) return fail(e.message);
    return fail(`could not parse SVG: ${(e as Error).message}`);
  }
}

function run(src: string): Result {
  if (typeof src !== 'string') return fail('icon is not text');
  if (Buffer.byteLength(src, 'utf8') > MAX_ICON_BYTES) return fail(`icon is larger than ${MAX_ICON_BYTES / 1024} KB`);
  let text = src.replace(/^﻿/, '');
  if (!text.trim()) return fail('icon is empty');

  if (/<!\s*ENTITY/i.test(text) || /<!\s*ELEMENT/i.test(text) || /<!\s*ATTLIST/i.test(text)) return fail('DTD/ENTITY declarations are not allowed');
  if (/<!\s*\[?\s*CDATA/i.test(text)) return fail('CDATA sections are not allowed');
  if (/<!doctype/i.test(text)) {
    // only a plain doctype (no internal subset) is tolerated; it is dropped
    const m = /<!doctype[^>[\]]*>/i.exec(text);
    if (!m || /<!doctype[^>]*\[/i.test(text)) return fail('DTD/ENTITY declarations are not allowed');
    text = text.replace(m[0], '');
  }
  const flat = text.replace(/[\s\u0000-\u001f]+/g, '').toLowerCase();
  if (flat.includes('javascript:')) return fail('javascript: is not allowed');
  if (flat.includes('data:')) return fail('data: is not allowed');

  const valid = XMLValidator.validate(text);
  if (valid !== true) return fail(`not well-formed XML: ${valid.err.msg}`);

  const parser = new XMLParser({
    preserveOrder: true,
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    processEntities: false,
    htmlEntities: false,
    parseTagValue: false,
    parseAttributeValue: false,
    trimValues: true,
    allowBooleanAttributes: false,
  });
  const tree = parser.parse(text) as Node[];

  const roots = tree.filter((n) => {
    const k = Object.keys(n).find((x) => x !== ':@');
    return k !== undefined && !k.startsWith('?') && k !== '#text';
  });
  const stray = tree.some((n) => '#text' in n && String(n['#text']).trim() !== '');
  if (stray) return fail('text outside the root <svg> element');
  if (roots.length !== 1) return fail(roots.length === 0 ? 'no root element' : 'icon must have a single root <svg> element');

  let count = 0;
  const ser = (n: Node, depth: number, isRoot: boolean): string => {
    if (depth > MAX_DEPTH) reject('SVG is nested too deeply');
    if (++count > MAX_ELEMENTS) reject('SVG has too many elements');
    const name = Object.keys(n).find((k) => k !== ':@')!;
    if (name.includes(':') || !ELEMENTS.has(name)) {
      const local = name.slice(name.lastIndexOf(':') + 1);
      if (FORBIDDEN.test(local.toLowerCase())) reject(`<${name}> elements are not allowed`);
      reject(`unsupported element <${name}>`);
    }
    if (isRoot && name !== 'svg') reject('root element must be <svg>');
    if (!isRoot && name === 'svg') reject('nested <svg> elements are not allowed');

    const raw = (n[':@'] ?? {}) as Record<string, string>;
    const attrs = new Map<string, string>();
    for (const [k, val] of Object.entries(raw)) {
      const a = k.slice(2);
      const al = a.toLowerCase();
      if (al.startsWith('on')) reject(`event handler attribute ${a} is not allowed`);
      if (al === 'href' || al.endsWith(':href')) reject(`${a} is not allowed`);
      checkValue(a, String(val));
      if (ATTRS.has(a)) attrs.set(a, String(val));
      // anything else (style, class, xmlns:*, ...) is dropped
    }

    if (isRoot) {
      if (attrs.get('xmlns') !== undefined && attrs.get('xmlns') !== SVG_NS) attrs.delete('xmlns');
      let vb: [number, number, number, number];
      if (attrs.has('viewBox')) vb = parseViewBox(attrs.get('viewBox')!);
      else {
        const w = num(attrs.get('width'));
        const h = num(attrs.get('height'));
        if (w !== undefined && h !== undefined) {
          vb = [0, 0, w, h];
          parseViewBox(vb.join(' '));
        } else vb = [0, 0, 120, 120];
      }
      attrs.set('viewBox', vb.join(' '));
      attrs.set('xmlns', SVG_NS);
      attrs.delete('width');
      attrs.delete('height');
    } else attrs.delete('xmlns');

    const kids = (n[name] as Node[]) ?? [];
    let inner = '';
    for (const c of kids) {
      const ck = Object.keys(c).find((k) => k !== ':@')!;
      if (ck === '#text') {
        if (String(c['#text']).trim() !== '') reject(`text content inside <${name}> is not allowed`);
        continue;
      }
      if (ck.startsWith('?') || ck === '#comment') continue;
      inner += ser(c, depth + 1, false);
    }
    const order = [...attrs.keys()].sort((a, b) => (a === 'xmlns' ? -1 : b === 'xmlns' ? 1 : 0));
    const at = order.map((k) => ` ${k}="${esc(attrs.get(k)!)}"`).join('');
    return inner ? `<${name}${at}>${inner}</${name}>` : `<${name}${at}/>`;
  };

  const svg = ser(roots[0]!, 0, true);
  if (Buffer.byteLength(svg, 'utf8') > MAX_ICON_BYTES) return fail(`icon is larger than ${MAX_ICON_BYTES / 1024} KB`);
  return { ok: true, svg };
}
