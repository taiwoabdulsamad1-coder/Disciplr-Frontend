/// <reference types="vite/client" />

// --------------------------------------------------------------------------
// Environment contract for the Vanity app.
p
// This module is a compile-time boundary. The invariants below
// are enforced by the runtime guard in `src/env.ts` (see `assertEnv`).
// The declarations here must stay in sync with that guard.
//
// Invariants:
//   1. Every key in `ImportMetaEnv` that the app reads at runtime
//      is either required (non-empty string) or explicitly optional.
//   2. Optional env values are never treated as defined by callers;
//      they must go through `readEnv`.
//   3. Mode is a closed union ('development' | 'production' | 'test')
//      so invalid modes fail at compile time.
//   4. Any url-like env value must be a valid absolute URL when present.
// --------------------------------------------------------------------------

type AppMode = "development" | "production" | "test";

interface ImportMetaEnv {
  /** Vite built-in. Always defined by Vite. */
  readonly MODE: AppMode;
  /** Vite built-in. Always defined by Vite. */
  readonly DEV: boolean;
  /** Vite built-in. Always defined by Vite. */
  readonly PROD: boolean;
  /** Vite built-in. Always defined by Vite. */
  readonly BASE_URL: string;

  /**
   * Base URL for the app's API. Required in production and test.
   * Optional in development (defaults to a relative path via the Vite proxy).
   */
  readonly VITE_API_BASE_URL?: string;

  /**
   * Public app name. Optional; falls back to a default in `readEnv`.
   */
  readonly VITE_APP_NAME?: string;

  /**
   * Feature flags. Only the literal string `"true"` enables a flag.
   * Any other value (including `"true "`, `"1"`, `"True"`) is treated as disabled.
   */
  readonly VITE_FEATURE_ANALYTICS?: string;
  readonly VITE_FEATURE_EXPORTS?: string;
  readonly VITE_FEATURE_DARK_MODE?: string;

  /**
   * Optional telemetry endpoint. Must be an absolute URL when present.
   */
  readonly VITE_TELEMETRY_URL?: string;

  /**
   * Optional build identifier exposed to the client for diagnostics.
   */
  readonly VITE_BUILD_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
