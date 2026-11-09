# Writing plugins

A plugin is a folder in the workspace. You can ask Claude Code to write it (the workspace `CLAUDE.md` already tells it the rules) or write it yourself.

```text
~/.kesh/workspace/plugins/<id>/
  manifest.json
  index.tsx
  icon.svg
  (any other .ts/.tsx files you import with a relative path)
```

Working examples are in [../examples/plugins](../examples/plugins). `hello` is the smallest; `water-tracker` is a good template for stateful plugins.

## manifest.json

```json
{
  "id": "water-tracker",
  "name": "Water",
  "description": "Daily water goal ring with a one-tap glass counter.",
  "permissions": ["haptics", "storage"]
}
```

| Field | Rules |
|---|---|
| `id` | kebab-case (`^[a-z0-9]+(-[a-z0-9]+)*$`), unique, equal to the folder name. |
| `name` | Non-empty. Shown on the home screen and review screen. |
| `description` | A sentence. Shown on the review screen. |
| `permissions` | Subset of `haptics`, `storage`, `clipboard`, `notifications`, `ai`. Declare what you use and nothing else. |

Do not write a `version`: the companion assigns and bumps it. A bad manifest fails the build with a message in the companion terminal.

## index.tsx

Default-export a React component.

```tsx
import React, { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { theme, haptics } from '@kesh/sdk';

export default function Counter() {
  const [n, setN] = useState(0);
  const { colors, fonts } = theme;
  return (
    <View style={{ flex: 1, backgroundColor: colors.ground, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: colors.text, fontFamily: fonts.display, fontSize: 64, fontWeight: '700' }}>{n}</Text>
      <Pressable onPress={() => { setN(n + 1); haptics.impact('light'); }}>
        <Text style={{ color: colors.accent, fontFamily: fonts.ui, fontSize: 17 }}>Add</Text>
      </Pressable>
    </View>
  );
}
```

Rules:

- **Imports:** only `react`, `react-native` and `@kesh/sdk`, plus relative imports of your own files (chess uses `./engine` and `./ai`). The app's `require` resolves just those three modules.
- **No other packages.** No `react-native-svg`, navigation libraries or icon packs. Draw with `View`s (borders, `borderRadius`, absolute positioning).
- **No native modules, no file system.** Keep network access out of plugins: it is not blocked technically (see [security.md](security.md)), but it is against the workspace rules and your permissions screen will not show it.
- **Root:** `flex: 1` with `theme.colors.ground` as the background.
- **Keep it small.** The convention is a single `index.tsx` under about 300 lines unless the plugin genuinely needs more (chess and five are larger).
- **To change a plugin, edit it in place.** Do not copy it to a new folder. To remove one, delete the folder.

## Permissions

Each SDK module needs its permission in `manifest.json`, otherwise calling it throws `Permission "x" not granted`. The user can also switch a permission off at install time, so wrap optional calls such as haptics in try/catch if a failure should not break the plugin. See [sdk.md](sdk.md) for the API and [security.md](security.md) for what permissions do and do not guarantee. If an update adds a permission, the user sees the review screen again.

## State and storage

- Use `useState` for UI state and `storage` for anything the user would miss.
- `storage` holds strings: `JSON.stringify` and `JSON.parse`.
- Load in `useEffect` on mount and do not write back before the load finished, or you overwrite saved data with defaults.
- Key daily data by date, for example `'glasses:' + new Date().toISOString().slice(0, 10)`.
- Hot reload remounts the plugin, so local `useState` resets on every update; persisted data does not.

## Design language: clean white

Use the tokens from `theme` rather than hard-coded values.

| Token | Value | Use |
|---|---|---|
| `colors.ground` | `#FFFFFF` | Screen background |
| `colors.surface` | `#F5F5F5` | Grouped content panels |
| `colors.hairline` | `#E6E6E6` | 1 px borders and dividers |
| `colors.text` | `#111111` | Primary text |
| `colors.muted` | `#6B6B6B` | Secondary text |
| `colors.accent` | `#2B59FF` | Primary actions, on and selected states |
| `colors.accentText` | `#FFFFFF` | Text on accent fills |
| `fonts.display`, `fonts.ui`, `fonts.mono` | system font, system font, monospace | Titles and numbers, body and labels, code |

`colors.brass` is a deprecated alias of `accent`. Guidelines used by the examples:

- Never italic.
- One cobalt accent. No other hues unless the user asks.
- Primary button: pill (`borderRadius: 999`), accent background, 52 to 56 px tall. Secondary: 1 px hairline outline pill.
- Titles: weight 700, 32 to 44 px, letter spacing about -1. Body 16 px or more. Labels: 13 px, weight 600, uppercase, letter spacing 1.2, muted.
- Grouped content: surface background, `borderRadius: 16`, hairline separators. No shadows, no gradients.
- 24 px screen padding, touch targets of at least 44 px, `Pressable` with a pressed opacity.
- Haptics for real events (goal reached, item added), not every tap.

## icon.svg

Every plugin should ship an `icon.svg`. The app draws it clipped to a rounded square (about 22 percent radius), from 40 px in lists up to 88 px on the review screen, so do not round the corners yourself.

Rules (an allowlist sanitizer on the Mac drops the icon if any is broken; the plugin still installs):

- One root `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">`, ideally under 3 KB (hard limit 24 KB), roughly square viewBox.
- Start with a full-bleed `<rect width="120" height="120">` background.
- Elements: `svg g defs linearGradient radialGradient stop clipPath mask path circle ellipse rect line polyline polygon`. No text (draw letters as paths), `image`, `use`, `style`, `filter`, `script`, animation or external references.
- Attributes: `viewBox width height x y cx cy r rx ry x1 y1 x2 y2 d points fill fill-opacity fill-rule clip-rule stroke stroke-width stroke-opacity stroke-linecap stroke-linejoin stroke-miterlimit stroke-dasharray stroke-dashoffset opacity transform offset stop-color stop-opacity id clip-path mask gradientUnits gradientTransform xmlns`. Other attributes, such as `style` and `class`, are dropped. `url()` may only point to `#id` in the same file.
- Recipe: saturated background, one bold white glyph centered with about 24 units of margin, 8 to 10 unit strokes with round caps, readable at 40 px.

The companion prints `WARNING plugin <id>: icon.svg ignored: <reason>` when an icon is rejected.

## Hermes gotchas

The app runs plugins on Hermes in release builds.

- **Loop closures.** Hermes can share one binding across loop iterations, so a handler created inside a `for`, `for...of` or `while` body, such as `onPress={() => pick(i)}`, may see the last value. Prefer `.map`, `.forEach` or `Array.from`. The companion adds a block-scoping transform that compensates, but do not rely on it.
- **No `eval` or `new Function` in plugins.**
- Target is es2019 (esbuild), then lowered further for Hermes. Modern syntax is fine; very new runtime APIs may not exist on Hermes.
- `console.log`, `console.warn` and `console.error` are forwarded to the companion terminal while the plugin is on screen. Render errors show in the error boundary ("This plugin stumbled"); bundle errors are printed by the companion.

## Testing

1. **Type check** in the workspace:

   ```bash
   cd ~/.kesh/workspace && npx tsc --noEmit -p .
   ```

   It must print nothing. The workspace includes type stubs for `@kesh/sdk`, `react` and `react-native`. If `tsc` is missing, run `npm i -D typescript` there once.
2. **Watch the companion.** A successful save prints `built <id> v<N>` then `pushed <id> v<N> to <n> device(s)`. A failure prints `BUILD ERROR in <id>`; the previous version stays on the phone.
3. **Try it on the phone or Simulator.** Accept the review screen, use it, ask for changes.
4. **Check the icon** at 40 px and 256 px.
5. In this repository, `npm run check -w packages/sdk` validates the template plugins' manifests and icons.

Pure logic (like chess's `engine.ts`) can be tested outside the app, since it is plain TypeScript with no React.
