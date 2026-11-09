import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'kesh-test-'));

export const GOOD = `import React from 'react';
import { View, Text } from 'react-native';
export default function P() { return <View><Text>hi</Text></View>; }
`;

export function writePlugin(pluginsDir: string, id: string, src = GOOD, manifest: object = {}) {
  const d = path.join(pluginsDir, id);
  fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, 'manifest.json'), JSON.stringify({ id, name: id, description: 'd', permissions: [], ...manifest }));
  fs.writeFileSync(path.join(d, 'index.tsx'), src);
}
