/**
 * Empery desktop shell contracts — adapted from EliteEW WindowState / DesktopItem
 * (see reference/eliteew/desktop/frontend/.../types/desktop.types.ts). Runtime-only;
 * no EliteEW imports.
 */

export type DesktopItemType = "folder" | "file" | "app";

export type DesktopItem = {
  id: string;
  name: string;
  type: DesktopItemType;
  position: { x: number; y: number };
  app_component?: string | null;
  category?: string | null;
  is_system?: boolean;
};

export type CatalogApp = {
  app_id: string;
  title: string;
  app_component: string;
  category: string;
  description?: string;
  icon?: string | null;
  enabled?: boolean;
  user_created?: boolean;
};

export type WindowState = {
  id: string;
  title: string;
  type: "folder" | "app";
  position: { x: number; y: number };
  size: { width: number; height: number };
  restoreBounds?: {
    position: { x: number; y: number };
    size: { width: number; height: number };
  } | null;
  isMinimized: boolean;
  isMaximized: boolean;
  zIndex: number;
  appComponent?: string;
  itemId: string;
};

export type ShellBootstrap = {
  schema_version: number;
  desktop_config: {
    wallpaper: string;
    theme: string;
    accent_color: string;
  };
  installed: { app_ids: string[] };
  items: DesktopItem[];
  catalog?: CatalogApp[];
};
