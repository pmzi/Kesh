import type { PluginPayload } from '../protocol';

const bundle = `
var React = require('react');
var RN = require('react-native');
var sdk = require('@kesh/sdk');
function Counter() {
  var s = React.useState(0);
  var n = s[0], setN = s[1];
  return React.createElement(RN.View, { style: { flex: 1, alignItems: 'center', justifyContent: 'center' } },
    React.createElement(RN.Text, { style: { color: sdk.theme.colors.text, fontSize: 96, fontFamily: sdk.theme.fonts.display } }, String(n)),
    React.createElement(RN.Pressable, { onPress: function () { setN(n + 1); sdk.haptics.impact('light'); console.log('count', n + 1); },
      style: { marginTop: 24, paddingHorizontal: 28, height: 48, borderRadius: 24, backgroundColor: sdk.theme.colors.accent, justifyContent: 'center' } },
      React.createElement(RN.Text, { style: { color: sdk.theme.colors.accentText, fontSize: 16 } }, 'Add one')));
}
module.exports.default = Counter;
`;

/** DEV ONLY sample icon (120x120, full-bleed). */
const DEV_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5B7FFF"/><stop offset="1" stop-color="#2B59FF"/></linearGradient></defs><rect width="120" height="120" fill="url(#g)"/><circle cx="60" cy="60" r="30" fill="none" stroke="#fff" stroke-width="8"/><circle cx="60" cy="60" r="8" fill="#fff"/></svg>';

export const FIXTURE: PluginPayload = {
  manifest: {
    id: 'dev-counter',
    name: 'Counter',
    version: 1,
    description: 'Built-in sample that tests the plugin host without a Mac.',
    permissions: ['haptics'],
  },
  bundle,
  ...(__DEV__ ? { icon: DEV_ICON } : {}),
  hash: 'dev-fixture',
};

/** DEV ONLY (reached only from __DEV__ code paths): exercises the `ai` module. */
const aiBundle = `
var React = require('react');
var RN = require('react-native');
var sdk = require('@kesh/sdk');
function T() {
  var s = React.useState('working...');
  React.useEffect(function () {
    (async function () {
      var out = '';
      try {
        var m = await sdk.ai.models();
        out += 'models: ' + JSON.stringify(m) + '\\n\\n';
        var r = await sdk.ai.generate({ model: 'on-device', prompt: 'Define "ephemeral" in one short sentence', schema: { type: 'object', properties: { meaning: { type: 'string' } }, required: ['meaning'] } });
        out += 'on-device: ' + JSON.stringify(r);
      } catch (e) { out += 'on-device error: ' + e.message; }
      s[1](out);
      if (out.indexOf('"claude":true') > -1) {
        try { var h = await sdk.ai.generate({ model: 'haiku', prompt: 'Reply with the word ok' }); out += '\\n\\nhaiku: ' + JSON.stringify(h); }
        catch (e) { out += '\\n\\nhaiku error: ' + e.message; }
        s[1](out);
      }
    })();
  }, []);
  return React.createElement(RN.View, { style: { flex: 1, padding: 24, paddingTop: 80 } },
    React.createElement(RN.Text, { style: { color: sdk.theme.colors.text, fontSize: 16 } }, s[0]));
}
module.exports.default = T;
`;

export const AI_FIXTURE: PluginPayload = {
  manifest: {
    id: 'dev-ai-test',
    name: 'AI test',
    version: 1,
    description: 'Dev-only check of the ai module.',
    permissions: ['ai'],
  },
  bundle: aiBundle,
  hash: 'dev-ai-fixture',
};
