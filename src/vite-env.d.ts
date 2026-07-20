/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_USE_WS?: string;
  readonly VITE_DEALER_ZONES?: string;
  readonly VITE_VENUE_PACKAGE?: string;
  readonly VITE_APP_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
