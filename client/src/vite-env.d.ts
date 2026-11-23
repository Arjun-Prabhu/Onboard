/**
 * @file Ambient types for Vite and build-time constants.
 */
/// <reference types="vite/client" />

/** App version from package.json, injected by Vite at build time. */
declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  /** AG Grid Enterprise license key (optional; without it the grid shows a watermark). */
  readonly VITE_AG_GRID_LICENSE_KEY?: string;
}
