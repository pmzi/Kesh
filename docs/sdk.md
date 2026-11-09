# @kesh/sdk reference

`@kesh/sdk` is provided by the iOS app at runtime. The types live in [packages/sdk/src/index.d.ts](../packages/sdk/src/index.d.ts) and are copied into each workspace as `types/kesh-sdk.d.ts`. The package is not published to npm; plugins import it and the app's plugin host resolves it.

```ts
import { haptics, storage, clipboard, notifications, ai, theme, usePluginInfo } from '@kesh/sdk';
```

Every module except `theme` and `usePluginInfo` is permission-gated. A call without the matching entry in `manifest.json` (or after the user switched it off at install time) throws `Error('Permission "x" not granted')`. Async functions reject with that error, synchronous ones throw it.

| Module | Permission |
|---|---|
| `haptics` | `haptics` |
| `storage` | `storage` |
| `clipboard` | `clipboard` |
| `notifications` | `notifications` |
| `ai` | `ai` |
| `theme`, `usePluginInfo` | none |

## haptics

Requires `haptics`. Uses `react-native-haptic-feedback`, with vibration fallback enabled.

```ts
haptics.impact(style?: 'light' | 'medium' | 'heavy'): void   // default 'medium'
haptics.notification(type: 'success' | 'warning' | 'error'): void
haptics.selection(): void
```

Use for real outcomes (goal reached, item added), not on every tap.

## storage

Requires `storage`. Persistent string key/value storage, backed by AsyncStorage and namespaced per plugin (`kesh:plugin:<id>:<key>`). One plugin cannot read another's keys through this API.

```ts
storage.get(key: string): Promise<string | null>     // null if the key does not exist
storage.set(key: string, value: string): Promise<void>
storage.remove(key: string): Promise<void>           // resolves even if missing
```

Values are strings: serialize objects with `JSON.stringify`. Data survives plugin updates and hot reloads. It is not deleted when the plugin is removed from the phone. It is not encrypted beyond iOS app sandboxing.

## clipboard

Requires `clipboard`. The system pasteboard.

```ts
clipboard.getString(): Promise<string>   // '' if empty
clipboard.setString(s: string): void
```

## notifications

Requires `notifications`.

```ts
notifications.schedule(opts: { title: string; body: string; seconds: number }): Promise<void>
```

**Not implemented.** After the permission check, the host throws `notifications not implemented yet`. The type exists so plugins can be written against the intended API; always wrap the call in try/catch. Notifications are on the roadmap.

## ai

Requires `ai`. See [ai.md](ai.md) for backends, errors and limits.

```ts
type AiModel = 'on-device' | 'haiku' | 'sonnet' | 'opus' | (string & {});

interface AiSchema {
  type: 'object';
  properties: Record<string,
    | { type: 'string'; description?: string }
    | { type: 'array'; items: { type: 'string' }; minItems?: number; maxItems?: number; description?: string }>;
  required?: string[];
}

ai.models(): Promise<{ onDevice: boolean; claude: boolean }>

ai.generate(req: { model: AiModel; system?: string; prompt: string }): Promise<string>
ai.generate<T = Record<string, unknown>>(req: {
  model: AiModel; system?: string; prompt: string; schema: AiSchema;
}): Promise<T>
```

- `models()` reports what is usable right now: `onDevice` when Apple's model is available (iOS 26, Apple Intelligence enabled and ready), `claude` when the Mac is connected and Claude Code was found by the companion.
- `generate()` resolves a string, or the parsed object when `schema` is given. It rejects with an `Error` whose message is meant to be shown to the user.
- `'on-device'` runs on the phone; any other model string runs on the Mac through your Claude Code.

## theme

No permission. Design tokens for the clean white look.

```ts
theme.colors: {
  ground: '#FFFFFF'; surface: '#F5F5F5'; hairline: '#E6E6E6';
  text: '#111111'; muted: '#6B6B6B';
  accent: '#2B59FF'; accentText: '#FFFFFF';
  brass: '#2B59FF';        // deprecated alias of accent
}
theme.fonts: { display: string; ui: string; mono: string }
```

`display` and `ui` are the system font; `mono` is a monospace face. See [plugin-authoring.md](plugin-authoring.md#design-language-clean-white) for usage rules.

## usePluginInfo

No permission. A React hook (call it in a component, not outside) that returns the running plugin's identity.

```ts
usePluginInfo(): { id: string; name: string }
```

## Errors you should expect

| Error message | Cause |
|---|---|
| `Permission "x" not granted` | Missing from the manifest, or switched off at install. |
| `notifications not implemented yet` | `notifications.schedule` is a stub. |
| `ai.generate needs a model and a prompt` | Missing or empty `model` or `prompt`. |
| `Your Mac is not connected` | A Claude model was requested while the companion is not connected. |
| Messages from the model backends | See [ai.md](ai.md). |
