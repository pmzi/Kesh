# Example plugins

Six plugins that Kesh was developed with. To try one, copy its folder into `~/.kesh/workspace/plugins/` while the companion is running; the companion builds it and the app offers it for review. They are also the best reference for what Claude Code should produce. See [../docs/plugin-authoring.md](../docs/plugin-authoring.md).

| Plugin | What it shows | Permissions | Icon |
|---|---|---|---|
| [hello](plugins/hello) | The smallest plugin: one component, theme tokens, a pressed-state button. | none | [icon.svg](plugins/hello/icon.svg) |
| [water-tracker](plugins/water-tracker) | A daily goal ring drawn with `View`s, one-tap counter, per-day persistence, haptics. | `haptics`, `storage` | [icon.svg](plugins/water-tracker/icon.svg) |
| [habit-tracker](plugins/habit-tracker) | Several habits, streaks, a month calendar of hit and missed days, stored as JSON. | `storage`, `haptics` | [icon.svg](plugins/habit-tracker/icon.svg) |
| [five](plugins/five) | A daily five-letter word game: keyboard, statistics, copying a shareable result. | `storage`, `haptics`, `clipboard` | [icon.svg](plugins/five/icon.svg) |
| [chess](plugins/chess) | A full chess game against a computer opponent. Multi-file: `engine.ts` (move generation and rules) and `ai.ts` (search; this is a classic engine, not a language model). | `storage`, `haptics` | [icon.svg](plugins/chess/icon.svg) |
| [dictionary](plugins/dictionary) | `ai.generate` with a schema, `ai.models()`, a model picker (on-device or Claude), history in storage, error handling with retry. | `ai`, `storage` | [icon.svg](plugins/dictionary/icon.svg) |

The icons are plain SVG files (120 by 120 viewBox, full-bleed square; the app rounds the corners).

These plugins are plain TypeScript and React Native. They import only `react`, `react-native` and `@kesh/sdk`.
