/**
 * @kesh/sdk: runtime API available to Kesh plugins. Provided by the iOS host.
 * Every module is permission-gated: calling it without the matching entry in
 * manifest.json "permissions" throws Error('Permission "x" not granted').
 */

/** Tactile feedback. Requires permission "haptics". */
export const haptics: {
  /** Physical tap. `style` defaults to 'medium'. */
  impact(style?: 'light' | 'medium' | 'heavy'): void;
  /** Success / warning / error pattern. Use sparingly, for real outcomes. */
  notification(type: 'success' | 'warning' | 'error'): void;
  /** Light tick for selection changes (pickers, toggles). */
  selection(): void;
};

/** Persistent string key/value storage, namespaced per plugin. Requires permission "storage". */
export const storage: {
  /** Read a value; resolves null if the key does not exist. */
  get(key: string): Promise<string | null>;
  /** Write a value. Serialize objects yourself with JSON.stringify. */
  set(key: string, value: string): Promise<void>;
  /** Delete a key. Resolves even if the key does not exist. */
  remove(key: string): Promise<void>;
};

/** System clipboard. Requires permission "clipboard". */
export const clipboard: {
  /** Resolves the current clipboard text ('' if empty). */
  getString(): Promise<string>;
  /** Replace the clipboard text. */
  setString(s: string): void;
};

/** Local notifications. Requires permission "notifications". */
export const notifications: {
  /**
   * Schedule a local notification `seconds` from now.
   * May be unimplemented in v1: it can throw 'not implemented yet'. Wrap in try/catch.
   */
  schedule(opts: { title: string; body: string; seconds: number }): Promise<void>;
};

/** Model choice for `ai.generate`. Same shape as the protocol's AiModel. */
export type AiModel = 'on-device' | 'haiku' | 'sonnet' | 'opus' | (string & {});

/** Tiny JSON-schema subset for structured output: an object whose properties are strings or string arrays. */
export interface AiSchema {
  type: 'object';
  properties: Record<
    string,
    | { type: 'string'; description?: string }
    | { type: 'array'; items: { type: 'string' }; minItems?: number; maxItems?: number; description?: string }
  >;
  required?: string[];
}

/**
 * Language models. Requires permission "ai".
 *
 * - `'on-device'` runs Apple's model on the phone: private, offline, but small.
 *   Keep prompts short and schemas small.
 * - `'haiku'`, `'sonnet'`, `'opus'` (or any Claude alias / model id) run on the user's
 *   Claude Code on their Mac, through the companion. They need the Mac connected.
 *
 * Never put secrets in prompts. Always handle rejection: show a calm message and offer a retry.
 */
export const ai: {
  /**
   * What can be used right now.
   * `onDevice`: Apple's on-device model is usable. `claude`: the paired Mac is connected
   * and has Claude Code available. Use it to default and to disable model choices.
   */
  models(): Promise<{ onDevice: boolean; claude: boolean }>;
  /**
   * Generate text. Resolves a string, or with a `schema` the parsed object.
   * Rejects with an Error whose message is readable by the user.
   */
  generate(req: { model: AiModel; system?: string; prompt: string }): Promise<string>;
  generate<T = Record<string, unknown>>(req: {
    model: AiModel;
    system?: string;
    prompt: string;
    schema: AiSchema;
  }): Promise<T>;
};

/** Hook returning identity of the running plugin. Needs no permission. */
export function usePluginInfo(): {
  /** Plugin id (folder name under plugins/). */
  id: string;
  /** Display name from manifest.json. */
  name: string;
};

/** Design tokens matching the Kesh app's clean white look. Needs no permission. */
export const theme: {
  /** Color tokens. */
  colors: {
    /** App background (white). */
    ground: '#FFFFFF';
    /** Grouped content panels. */
    surface: '#F5F5F5';
    /** 1px borders and dividers. */
    hairline: '#E6E6E6';
    /** Primary text. */
    text: '#111111';
    /** Secondary text, captions. */
    muted: '#6B6B6B';
    /** Cobalt accent: primary buttons and on/selected states. */
    accent: '#2B59FF';
    /** Text color to use on accent fills. */
    accentText: '#FFFFFF';
    /** @deprecated Alias of `accent`. Use `accent`. */
    brass: '#2B59FF';
  };
  /** Font family names to pass as fontFamily. */
  fonts: {
    /** System font (SF) for titles and big numbers. */
    display: string;
    /** System font (SF) for body and labels. */
    ui: string;
    /** Monospace face. */
    mono: string;
  };
};
