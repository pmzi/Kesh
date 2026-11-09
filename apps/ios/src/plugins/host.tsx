import React from 'react';
import * as ReactNative from 'react-native';
import { colors, fonts } from '../theme';
import { createSdk, PluginInfoContext } from '../sdk';
import type { InstalledPlugin } from './store';

/**
 * Hermes does not give per-iteration bindings to `let` captured by closures in
 * `for (let key of ...)`. esbuild's __copyProps helper relies on that, so every
 * re-exported getter would return the LAST key (e.g. React.useState -> "19.3.0").
 * Rewrite the helper's getter to capture the key explicitly.
 */
export function patchBundle(code: string): string {
  return code.replace(
    'get: () => from[key]',
    'get: ((k) => () => from[k])(key)',
  );
}

/** Evaluate a plugin bundle. `require` resolves only react, react-native, @kesh/sdk. */
export function loadPlugin(rec: Pick<InstalledPlugin, 'manifest' | 'granted' | 'bundle'>): React.ComponentType {
  const sdk = createSdk({
    id: rec.manifest.id,
    name: rec.manifest.name,
    permissions: rec.granted,
  });
  const modules: Record<string, unknown> = {
    react: React,
    'react-native': ReactNative,
    '@kesh/sdk': sdk,
  };
  const req = (name: string) => {
    if (Object.prototype.hasOwnProperty.call(modules, name)) return modules[name];
    throw new Error(`Cannot require "${name}": plugins may only use react, react-native, @kesh/sdk`);
  };
  const module: { exports: any } = { exports: {} };
  // eslint-disable-next-line no-new-func
  const fn = new Function('module', 'exports', 'require', patchBundle(rec.bundle));
  fn(module, module.exports, req);
  const C = module.exports?.default ?? module.exports;
  if (typeof C !== 'function' && !(C && typeof C === 'object' && '$$typeof' in C)) {
    throw new Error('Plugin did not export a default component');
  }
  const Comp = C as React.ComponentType;
  const info = { id: rec.manifest.id, name: rec.manifest.name };
  const Wrapped: React.FC = () => (
    <PluginInfoContext.Provider value={info}>
      <Comp />
    </PluginInfoContext.Provider>
  );
  return Wrapped;
}

interface BoundaryProps {
  children: React.ReactNode;
}
export class PluginErrorBoundary extends React.Component<BoundaryProps, { error?: Error }> {
  state: { error?: Error } = {};
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  reload = () => this.setState({ error: undefined });
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <ReactNative.View style={s.wrap}>
        <ReactNative.Text style={s.title}>This plugin stumbled.</ReactNative.Text>
        <ReactNative.Text style={s.msg}>{this.state.error.message}</ReactNative.Text>
        <ReactNative.Pressable style={s.btn} onPress={this.reload}>
          <ReactNative.Text style={s.btnText}>Reload</ReactNative.Text>
        </ReactNative.Pressable>
      </ReactNative.View>
    );
  }
}

const s = ReactNative.StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  title: { fontFamily: fonts.display, fontSize: 32, fontWeight: '700', letterSpacing: -1, color: colors.text, textAlign: 'center' },
  msg: { fontSize: 14, color: colors.muted, textAlign: 'center', marginTop: 12 },
  btn: {
    marginTop: 28,
    paddingHorizontal: 28,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.hairline,
    justifyContent: 'center',
  },
  btnText: { color: colors.text, fontSize: 15, fontWeight: '600' },
});
