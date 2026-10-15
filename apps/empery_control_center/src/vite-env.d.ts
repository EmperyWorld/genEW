/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ECC_API_BASE?: string;
  readonly VITE_ECC_WS_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
