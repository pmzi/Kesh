import { transformSync } from '@babel/core';
// @ts-expect-error no types shipped for this plugin
import blockScoping from '@babel/plugin-transform-block-scoping';

/**
 * Hermes (bytecode, iOS release) shares ONE binding across loop iterations, so closures
 * created in a loop body all see the last iteration's value. Lower let/const to var and
 * wrap loop bodies that contain closures in a `_loop` function (per-iteration scope).
 * Idempotent on code that has no block-scoped bindings captured by closures.
 */
export function lowerBlockScoping(code: string): string {
  const out = transformSync(code, {
    configFile: false,
    babelrc: false,
    browserslistConfigFile: false,
    sourceType: 'script',
    compact: false,
    comments: true,
    retainLines: true,
    sourceMaps: false,
    plugins: [blockScoping],
  });
  if (!out || typeof out.code !== 'string') throw new Error('block-scoping transform produced no output');
  return out.code;
}
