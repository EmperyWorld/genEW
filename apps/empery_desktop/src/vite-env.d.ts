/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DESKTOP_SHELL_API_BASE: string;
  readonly VITE_ECC_API_BASE: string;
  readonly VITE_ECC_UI_BASE: string;
  readonly VITE_EIC_API_BASE: string;
  readonly VITE_IMAGE_STUDIO_API_BASE: string;
  readonly VITE_VIDEO_STUDIO_API_BASE: string;
  readonly VITE_MUSIC_FORGE_API_BASE: string;
  readonly VITE_SITE_STUDIO_API_BASE: string;
  readonly VITE_AI_CHAT_API_BASE: string;
  readonly VITE_DEDMOROZ_API_BASE: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
