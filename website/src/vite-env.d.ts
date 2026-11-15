/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the separately hosted AI Shield backend, e.g. https://shield.example.com. Empty disables AI Shield. */
  readonly VITE_SHIELD_API_URL?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
