import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

/**
 * Vite configuration for the application.
 *
 * Invariants enforced by this module:
 *  1. The `@/` import alias always resolves to `<root>/src`, even when the
 *     config is loaded from a different working directory.
 *  2. Vendor chunks are deterministic and mutually exclusive; a module is
 *     assigned to at most one manual chunk, so Rollup never emits duplicate
 *     code across chunks or fails with "cannot assign module to multiple
 *     chunks".
 *  3. The dev server port and API proxy target are validated before use, so
 *     invalid or missing environment values fail fast with actionable
 *     messages instead of silently producing a misconfigured server.
 *  4. Environment values are normalized once at config-load time, so retries
 *     or repeated loads of this module yield identical results.
 *
 * This file is executed by Vite in Node, so it must not rely on browser
 * globals. Failures are reported via Error messages that never echo secret
 * values.
 */

const DEFAULT_PORT = 5173;
const DEFAULT_PROXY_TARGET = "http://localhost:3000";

/**
 * Parse a port number from an environment variable.
 *
 * Boundary behavior:
 *  - undefined/empty -> fallback to default
 *  - non-numeric     -> throw with the variable name (no value echoed)
 *  - out of range    -> throw with the variable name
 *  - valid          -> return the integer
 */
function parsePort(raw: string | undefined, varName: string): number {
  if (raw === undefined || raw.trim() === "") {
    return DEFAULT_PORT;
  }
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) {
    throw new Error(
      `Invalid ${varName}: expected an integer port, set ${varName} to a number between 1 and 65535.`,
    );
  }
  const port = Number(trimmed);
  if (!withinRange(port, 1, 65535)) {
    throw new Error(
      `Invalid ${varName}: expected a port between 1 and 65535, received a value out of range.`,
    );
  }
  return port;
}

/**
 * Validate a proxy target URL.
 *
 * Accepts any absolute http/https URL. Rejects blank values, non-URLs,
 * and non-http(s) schemes. Error messages do not echo the raw value to
 * avoid leaking credentials embedded in a URL.
 */
function parseProxyTarget(raw: string | undefined, varName: string): string {
  if (raw === undefined || raw.trim() === "") {
    return DEFAULT_PROXY_TARGET;
  }
  const trimmed = raw.trim();
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(
      `Invalid ${varName}: expected an absolute http(s) URL. Value was not echoed for security.`,
    );
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(
      `Invalid ${varName}: expected an http or https URL. Value was not echoed for security.`,
    );
  }
  if (!parsed.hostname) {
    throw new Error(
      `Invalid ${varName}: expected a URL with a hostname. Value was not echoed for security.`,
    );
  }
  return trimmed;
}

function withinRange(value: number, min: number, max: number): boolean {
  return Number.isInteger(value) && value >= min && value <= max;
}

/**
 * Map of vendor matchers to chunk names. Order is irrelevant because
 * matching is exclusive: the first match wins and the function returns
 * immediately. This guarantees a given module is never assigned to two
 * chunks.
 */
const VENDOR_CHUNKS: ReadonlyArray<{ test: (id: string) => boolean; name: string }> = [
  { test: (id) => id.includes("recharts"), name: "vendor-recharts" },
  { test: (id) => id.includes("jspdf"), name: "vendor-jspdf" },
  { test: (id) => id.includes("framer-motion"), name: "vendor-framer-motion" },
];

export function manualChunkFor(id: string): string | undefined {
  if (typeof id !== "string" || id === "") {
    return undefined;
  }
  for (const entry of VENDOR_CHUNKS) {
    if (entry.test(id)) {
      return entry.name;
    }
  }
  return undefined;
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode);
  const port = parsePort(env.VITE_DEV_PORT, "VITE_DEV_PORT");
  const proxyTarget = parseProxyTarget(
    env.VITE_API_PROXY_TARGET,
    "VITE_API_PROXY_TARGET",
  );

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: { "@": path.resolve(__dirname, "./src") },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: manualChunkFor,
        },
      },
    },
    server: {
      port,
      proxy: {
        "/api": { target: proxyTarget, changeOrigin: true },
      },
    },
  };
});
