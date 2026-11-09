# Kesh workspace

Kesh is a malleable iOS app. The user asks you for plugins; you write React Native
components here; a companion process on this Mac bundles each plugin and pushes it
to the user's phone, which evaluates it on-device. Your job: write correct plugins
on the first try.

## Layout

```
plugins/<id>/manifest.json   { "id", "name", "description", "permissions" }
plugins/<id>/index.tsx       default-exports a React component
```

- `<id>` is kebab-case and equals the folder name and manifest `id`.
- NO `version` in the manifest. The companion manages it.
- `permissions` is an array of: `haptics`, `storage`, `clipboard`, `notifications`, `ai`.
- Study `plugins/water-tracker` and `plugins/hello` before writing a new plugin.

## Hard rules

- Only these imports: `react`, `react-native`, `@kesh/sdk`. Nothing else.
- No other npm packages (no react-native-svg, no navigation libs, no icon packs).
- No `fetch`, no remote code, no `eval` / `new Function`, no native modules, no file system.
- Draw graphics with `View`s (borders, borderRadius, absolute positioning).
- Default export is the component. The root should be `flex: 1` with the ground background.
- Declare every permission you use in manifest.json, and only those.
  A call without the permission throws `Permission "x" not granted`.

## SDK (`import { ... } from '@kesh/sdk'`)

```
haptics.impact(style?: 'light'|'medium'|'heavy'): void      // permission 'haptics'
haptics.notification('success'|'warning'|'error'): void     // 'haptics'
haptics.selection(): void                                    // 'haptics'
storage.get(key): Promise<string|null>                       // permission 'storage'
storage.set(key, value): Promise<void>                       // 'storage'
storage.remove(key): Promise<void>                           // 'storage'
clipboard.getString(): Promise<string>                       // permission 'clipboard'
clipboard.setString(s): void                                 // 'clipboard'
notifications.schedule({title, body, seconds}): Promise<void> // permission 'notifications'
ai.models(): Promise<{onDevice, claude}>                     // permission 'ai'
ai.generate({model, system?, prompt, schema?}): Promise<string | object> // 'ai'
usePluginInfo(): { id, name }                                // no permission
theme.colors / theme.fonts                                   // no permission
```

- Storage is strings only and namespaced per plugin. Use `JSON.stringify` / `JSON.parse`.
- `notifications.schedule` may throw `not implemented yet` in v1. Wrap it in try/catch.
- Full JSDoc is in `types/kesh-sdk.d.ts`.

## AI (`ai`, permission 'ai')

- Use it when a plugin needs language understanding or writing. Not for things plain code can do.
- Models: `'on-device'` (Apple, on the phone: private, offline, small: short prompts, small schemas) or
  `'haiku'` | `'sonnet'` | `'opus'` (user's Claude Code on the Mac: needs the Mac connected).
- Call `ai.models()` first: `{ onDevice, claude }`. Default to on-device if available, else haiku if
  `claude`. Offer a model picker (chips) and disable unavailable models.
- Pass `schema` for structured output: `{ type:'object', properties:{ meaning:{type:'string'},
  examples:{type:'array', items:{type:'string'}, minItems:2, maxItems:2} }, required:[...] }`.
  Then `generate<{meaning:string; examples:string[]}>(...)` resolves the parsed object.
- It rejects with a readable message: catch it, show it calmly with a Retry button. Never crash.
- Never put secrets in prompts. Show a loading state while waiting.
- Guard for older hosts: if `ai` is undefined, show 'This version of Kesh does not support AI yet.'

## Design language: clean white

- Colors only from `theme.colors`: `ground` (#FFFFFF screen bg), `surface` (#F5F5F5 grouped
  content), `hairline` (1px lines), `text` (near-black), `muted` (secondary), `accent` (cobalt blue),
  `accentText` (text on accent fills). `brass` is a deprecated alias of `accent`; do not use it.
  Never hardcode hex values. Text stays near-black. No other hues unless the user asks.
- Fonts only from `theme.fonts` (`display` and `ui` are the system font, `mono` for code).
- NEVER italic: never set `fontStyle: 'italic'`.
- One cobalt accent for primary actions and on/selected states (success and emphasis use accent too).
- Primary button: solid pill (borderRadius 999), `accent` background, `accentText` text,
  52-56px tall. Secondary: 1px hairline outline pill, `text` color.
- Titles: fontWeight '700', 32-44px, letterSpacing about -1. Body 16px or more.
  Labels: 13px, fontWeight '600', uppercase, letterSpacing 1.2, `muted`.
- Grouped content: `surface` background with borderRadius 16. Separators: 1px `hairline`.
- No shadows, no gradients. Generous whitespace: 24px screen padding, 16-32px between groups.
- Touch targets at least 44px. Use `Pressable` with a pressed opacity.
- Use haptics for real events (goal reached, item added), not on every tap.

## State

- `useState` for UI state. Persist anything the user would miss with `storage`.
- Load in `useEffect` on mount; guard writes until the load finished.
- Key by date when data is daily, e.g. `'glasses:' + new Date().toISOString().slice(0, 10)`.
- Keep a plugin self-contained, under ~300 lines, in a single `index.tsx`.

## Editing

- To change an existing plugin, edit its files in place. Do not create a copy
  (`water-tracker-2`). The phone hot-reloads on every save.
- Keep the same `id` when modifying. Never rename a plugin folder unless asked.
- To remove a plugin, delete its folder.

## What the user sees

When you save a plugin the companion builds it and pushes it. The phone shows a
review screen (name, description, permissions). The user accepts it and the
plugin runs. A bundle error or a runtime error is logged to the companion terminal.

## Verify before you finish

Run `npx tsc --noEmit -p .` in this workspace. It must print nothing. Fix every
error. If `tsc` is missing, run `npm i -D typescript` here once.

## Hermes gotcha
Hermes (iOS release) can share ONE binding across loop iterations, so a closure made in a `for`/`for-of`/`while` body (e.g. `onPress={() => pick(i)}`) sees the last value (every tap acts on the last item).
Prefer `.map` / `.forEach` / `Array.from` over `for` loops when creating handlers. The build now compensates (block-scoping transform), but do not rely on it.

## Icon
Every new plugin ships `plugins/<id>/icon.svg`, created together with the plugin. The app draws it clipped to a rounded square (~22% radius, 40px in lists up to 88px on review), so do not round corners yourself.
Rules (allowlist sanitizer; any violation drops the icon):
- One root `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">`, under ~3 KB. First element is a full-bleed `<rect width="120" height="120">` background.
- Elements only: svg g defs linearGradient radialGradient stop clipPath mask path circle ellipse rect line polyline polygon. No text (draw letters as paths), image, use, style, filter, script, animate, external refs. Gradients only via `url(#id)`.
- Attributes only: viewBox width height x y cx cy r rx ry x1 y1 x2 y2 d points fill fill-opacity fill-rule clip-rule stroke stroke-width stroke-opacity stroke-linecap stroke-linejoin stroke-miterlimit stroke-dasharray stroke-dashoffset opacity transform offset stop-color stop-opacity id clip-path mask gradientUnits gradientTransform xmlns.
Recipe: solid saturated background (optional subtle top-to-bottom gradient of the same hue, max 8% lightness shift) with strong white contrast, e.g. cobalt #2B59FF, indigo #4B4DED, azure #1D9BF0, emerald #12A150, graphite #1F2937, violet #6D4AFF (pick an unused hue for a new plugin). One bold, simple white glyph centered with ~24px margin, 8-10 unit strokes with round caps/joins, no text, no shadows, no gradient on the glyph. It must read at 40px.
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">
  <rect width="120" height="120" fill="#12A150"/>
  <circle cx="60" cy="60" r="34" fill="none" stroke="#fff" stroke-width="9" stroke-opacity=".4"/>
  <polyline points="42,62 55,75 80,46" fill="none" stroke="#fff" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
```
Optional: if tools are available, render to PNG (e.g. `@resvg/resvg-js` in /tmp) at 40px and 256px and look at it. `check-template.mjs` validates template icons.
