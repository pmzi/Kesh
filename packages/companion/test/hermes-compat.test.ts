import { describe, it, expect } from 'vitest';
import { lowerBlockScoping } from '../src/hermes-compat';

function run(code: string): unknown {
  const module: { exports: any } = { exports: {} };
  // eslint-disable-next-line no-new-func
  new Function('module', 'exports', 'require', code)(module, module.exports, () => ({}));
  return module.exports.out;
}

const cases: Record<string, string> = {
  'for-let closure': `var fs=[];for(let i=0;i<4;i++){fs.push(()=>i)}module.exports.out=fs.map(f=>f());`,
  'nested for-let with const in body': `var fs=[];for(let r=0;r<3;r++){for(let f=0;f<3;f++){const sq=r*16+f;fs.push(()=>sq)}}module.exports.out=fs.map(f=>f());`,
  'for-of const': `var fs=[];for(const x of [10,20,30]){fs.push(()=>x)}module.exports.out=fs.map(f=>f());`,
  'for-in const': `var fs=[];for(const k in {a:1,b:2}){fs.push(()=>k)}module.exports.out=fs.map(f=>f());`,
  'while let': `var fs=[],i=0;while(i<4){let j=i*3;fs.push(()=>j);i++}module.exports.out=fs.map(f=>f());`,
  'labeled continue/break': `
    var fs=[],log=[];
    outer: for(let a=0;a<5;a++){
      for(let b=0;b<5;b++){
        const v=a*10+b;
        if(b===3) continue outer;
        if(a===3) break outer;
        if(b===1) continue;
        fs.push(()=>v);
        log.push(v);
      }
    }
    module.exports.out=[fs.map(f=>f()),log];`,
  'return inside loop with closure': `
    function find(){for(const x of [1,2,3,4]){const g=()=>x*2; if(g()>=6) return g}return null}
    module.exports.out=find()();`,
  'closure mutating loop var': `var fs=[];for(let i=0;i<5;i++){fs.push(()=>i);i++}module.exports.out=fs.map(f=>f());`,
};

describe('lowerBlockScoping', () => {
  for (const [name, src] of Object.entries(cases)) {
    it(`${name}: same behavior, wrapped in _loop`, () => {
      const out = lowerBlockScoping(src);
      expect(run(out)).toEqual(run(src));
      expect(out).toContain('_loop');
      expect(out).not.toMatch(/\b(let|const)\s/);
    });
  }

  it('returns valid CJS for new Function and leaves loop-free code semantically equal', () => {
    const src = `"use strict";const a=1;let b=2;module.exports.out=a+b;`;
    expect(run(lowerBlockScoping(src))).toBe(3);
  });
});
