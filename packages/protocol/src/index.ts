/**
 * Kesh wire protocol. Single source of truth shared by the companion (Mac)
 * and the iOS app. JSON messages over one WebSocket.
 *
 * Pairing QR / manual-entry URL:  kesh://pair?host=<ip>&port=<port>&token=<one-time-token>
 * WebSocket endpoint:             ws://<host>:<port>/ws
 */

export const PROTOCOL_VERSION = 1;

/** Permissions a plugin may request. Each maps to an @kesh/sdk module. */
export type Permission = 'haptics' | 'storage' | 'clipboard' | 'notifications' | 'ai';

/**
 * Models reachable through the `ai` SDK module.
 * - 'on-device': Apple's FoundationModels on the phone (iOS 26+, Apple Intelligence enabled).
 * - 'haiku' | 'sonnet' | 'opus' (or any alias / model id string): the user's own Claude Code on the Mac,
 *   run by the companion as a subprocess. The phone never sees any Claude credential.
 */
export type AiModel = 'on-device' | 'haiku' | 'sonnet' | 'opus' | (string & {});

/** Tiny JSON-schema subset for structured output: an object whose properties are string | string[]. */
export interface AiSchema {
  type: 'object';
  properties: Record<string, { type: 'string'; description?: string } | { type: 'array'; items: { type: 'string' }; minItems?: number; maxItems?: number; description?: string }>;
  required?: string[];
}

export interface AiRequest {
  model: AiModel;
  /** system / instructions */
  system?: string;
  prompt: string;
  /** when set, the result is parsed JSON matching the schema */
  schema?: AiSchema;
}

export interface PluginManifest {
  /** kebab-case, unique, equals the folder name under workspace/plugins/ */
  id: string;
  name: string;
  /** monotonically increasing integer, bumped by the companion on every rebuild */
  version: number;
  description: string;
  permissions: Permission[];
}

/** A built plugin. `bundle` is the body of a CommonJS module (see PLUGIN CONTRACT). */
export interface PluginPayload {
  manifest: PluginManifest;
  bundle: string;
  /**
   * Optional app icon: the contents of workspace/plugins/<id>/icon.svg (sanitized by the companion,
   * <= 24 KB). Drawn full-bleed on a 120x120 viewBox; the app clips it to a rounded square.
   */
  icon?: string;
  /** sha256 hex of `bundle` + icon (so an icon-only change is detected and pushed) */
  hash: string;
}

/* ---------- phone -> companion ---------- */

export type ClientMessage =
  /** First message on every connection. Use `token` to pair, `deviceKey` to reconnect. */
  | { type: 'hello'; protocol: number; deviceName: string; token?: string; deviceKey?: string }
  /** Result of the user reviewing a pushed plugin. */
  | { type: 'ack'; id: string; version: number; status: 'installed' | 'declined' | 'error'; error?: string }
  /** Runtime log line from a plugin, shown in the companion terminal. */
  | { type: 'log'; id: string; level: 'info' | 'warn' | 'error'; message: string }
  /** A plugin asked for a Claude model (never 'on-device', that stays on the phone). */
  | { type: 'ai-request'; requestId: string; pluginId: string; request: AiRequest };

/* ---------- companion -> phone ---------- */

export type ServerMessage =
  /** Reply to a valid hello. `deviceKey` is only present when pairing just succeeded. */
  | { type: 'ready'; protocol: number; macName: string; deviceKey?: string; claudeAvailable?: boolean }
  /** Result of an ai-request. `result` is parsed JSON when a schema was given, otherwise a string. */
  | { type: 'ai-response'; requestId: string; ok: true; result: unknown }
  | { type: 'ai-response'; requestId: string; ok: false; error: string }
  | { type: 'error'; code: 'bad_token' | 'bad_device_key' | 'bad_protocol' | 'bad_message'; message: string }
  /** Sent right after `ready`: every plugin currently in the workspace. */
  | { type: 'snapshot'; plugins: PluginPayload[] }
  /** A plugin was created or rebuilt. */
  | { type: 'plugin'; plugin: PluginPayload }
  | { type: 'plugin-removed'; id: string };

/*
 * PLUGIN CONTRACT
 * ---------------
 * workspace/plugins/<id>/manifest.json  -> PluginManifest minus `version`
 * workspace/plugins/<id>/index.tsx      -> default-exports a React component
 *
 * The companion bundles index.tsx with esbuild to a single CommonJS string
 * (format: 'cjs', platform: 'neutral', jsx: 'transform' -> React.createElement,
 * externals: react, react-native, @kesh/sdk). The phone evaluates it with
 * `new Function('module','exports','require', bundle)` where `require` only
 * resolves those three modules. The component is `module.exports.default`.
 */
