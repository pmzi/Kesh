import { describe, it, expect } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import { sanitizeIcon } from '../src/icon';
import { buildPlugin, VersionStore } from '../src/builder';
import { tmp, writePlugin } from './helpers';

const wrap = (inner: string, attrs = 'viewBox="0 0 120 120"') => `<svg xmlns="http://www.w3.org/2000/svg" ${attrs}>${inner}</svg>`;
const VALID = wrap('<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f00"/><stop offset="1" stop-color="#00f"/></linearGradient></defs><circle cx="60" cy="60" r="40" fill="url(#g)"/><path d="M10 10L50 50" stroke="#fff" stroke-width="4"/>');

describe('sanitizeIcon', () => {
  it('accepts a valid icon, strips prolog/comments/doctype', () => {
    const r = sanitizeIcon(`<?xml version="1.0"?><!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd"><!-- hi -->${VALID}`);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.svg).toContain('fill="url(#g)"');
      expect(r.svg).toContain('viewBox="0 0 120 120"');
      expect(r.svg).toContain('<linearGradient');
      expect(r.svg).not.toMatch(/<\?xml|DOCTYPE|<!--/);
    }
  });

  const bad: [string, string][] = [
    ['script', wrap('<script>alert(1)</script>')],
    ['nested script in g', wrap('<g><g><script>alert(1)</script></g></g>')],
    ['uppercase SCRIPT', wrap('<SCRIPT>alert(1)</SCRIPT>')],
    ['foreignObject', wrap('<foreignObject><div/></foreignObject>')],
    ['image', wrap('<image width="1" height="1"/>')],
    ['use', wrap('<use x="1"/>')],
    ['style element', wrap('<style>*{}</style>')],
    ['text', wrap('<text>hi</text>')],
    ['a', wrap('<a><circle r="1"/></a>')],
    ['animate', wrap('<circle r="1"><animate attributeName="r"/></circle>')],
    ['animateTransform', wrap('<circle r="1"><animateTransform/></circle>')],
    ['set', wrap('<circle r="1"><set attributeName="r"/></circle>')],
    ['onload attr', wrap('<circle r="1" onload="x()"/>')],
    ['nested onclick', wrap('<g><rect OnClick="x()"/></g>')],
    ['href', wrap('<path d="M0 0" href="#x"/>')],
    ['xlink:href external', wrap('<path d="M0 0" xlink:href="http://evil.example/x"/>', 'viewBox="0 0 120 120" xmlns:xlink="http://www.w3.org/1999/xlink"')],
    ['fill url external', wrap('<rect width="5" height="5" fill="url(http://evil)"/>')],
    ['fill url quoted external', wrap('<rect width="5" height="5" fill="url(\'//evil\')"/>')],
    ['javascript:', wrap('<path d="M0 0" fill="JaVaScRiPt:alert(1)"/>')],
    ['data:', wrap('<path d="M0 0" fill="data:text/html,x"/>')],
    ['DOCTYPE entity', `<!DOCTYPE svg [<!ENTITY x "y">]>${wrap('<path d="M0 0"/>')}`],
    ['entity reference', wrap('<path d="M0 0" fill="&#106;avascript:x"/>')],
    ['CDATA', wrap('<![CDATA[<script>alert(1)</script>]]>')],
    ['stray text', wrap('hello')],
    ['two roots', wrap('<g/>') + wrap('<g/>')],
    ['not svg root', '<g><path d="M0 0"/></g>'],
    ['not xml', 'hello'],
    ['non-square viewBox', wrap('<path d="M0 0"/>', 'viewBox="0 0 200 20"')],
  ];
  for (const [name, svg] of bad) {
    it(`rejects ${name}`, () => {
      const r = sanitizeIcon(svg);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.length).toBeGreaterThan(0);
    });
  }

  it('drops style attribute and unknown attrs, keeps rest', () => {
    const r = sanitizeIcon(wrap('<rect width="5" height="5" style="fill:red" class="x" data-a="1" fill="#fff"/>'));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.svg).not.toMatch(/style|class|data-a/);
      expect(r.svg).toContain('fill="#fff"');
    }
  });

  it('enforces 24 KB limit', () => {
    const big = wrap(`<path d="${'M0 0 '.repeat(6000)}"/>`);
    const r = sanitizeIcon(big);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/24 KB/);
  });

  it('derives viewBox from width/height, defaults when absent', () => {
    const a = sanitizeIcon('<svg width="64px" height="64"><path d="M0 0"/></svg>');
    expect(a.ok && a.svg).toContain('viewBox="0 0 64 64"');
    const b = sanitizeIcon('<svg><path d="M0 0"/></svg>');
    expect(b.ok && b.svg).toContain('viewBox="0 0 120 120"');
    const c = sanitizeIcon('<svg viewBox="0 0 100 110" width="10"><path d="M0 0"/></svg>');
    expect(c.ok && c.svg).toContain('viewBox="0 0 100 110"');
    expect(c.ok && c.svg).not.toContain('width=');
  });
});

describe('builder icon', () => {
  const setup = () => {
    const d = tmp();
    const p = path.join(d, 'plugins');
    writePlugin(p, 'a');
    return { d, p, vf: path.join(d, 'v.json') };
  };
  const build = async (p: string, vf: string) => {
    const r = await buildPlugin(p, 'a', new VersionStore(vf));
    if (!r.ok) throw new Error(r.error);
    return r;
  };

  it('includes icon; icon-only change bumps version; removal bumps again', async () => {
    const { p, vf } = setup();
    const r0 = await build(p, vf);
    expect(r0.payload.icon).toBeUndefined();
    expect(r0.payload.manifest.version).toBe(1);
    fs.writeFileSync(path.join(p, 'a/icon.svg'), VALID);
    const r1 = await build(p, vf);
    expect(r1.payload.icon).toContain('<circle');
    expect(r1.payload.manifest.version).toBe(2);
    expect(r1.payload.bundle).toBe(r0.payload.bundle);
    expect((await build(p, vf)).payload.manifest.version).toBe(2);
    fs.rmSync(path.join(p, 'a/icon.svg'));
    const r2 = await build(p, vf);
    expect(r2.payload.icon).toBeUndefined();
    expect(r2.payload.manifest.version).toBe(3);
    expect(r2.payload.hash).toBe(r0.payload.hash);
  });

  it('invalid icon: plugin still builds, warning names reason', async () => {
    const { p, vf } = setup();
    fs.writeFileSync(path.join(p, 'a/icon.svg'), wrap('<script>x</script>'));
    const r = await build(p, vf);
    expect(r.payload.icon).toBeUndefined();
    expect(r.iconWarning).toMatch(/icon\.svg.*script/);
    fs.writeFileSync(path.join(p, 'a/icon.svg'), 'x'.repeat(30000));
    expect((await build(p, vf)).iconWarning).toMatch(/24 KB/);
    fs.writeFileSync(path.join(p, 'a/icon.svg'), Buffer.from([0xff, 0xfe, 0x41]));
    expect((await build(p, vf)).iconWarning).toMatch(/UTF-8/);
  });
});
