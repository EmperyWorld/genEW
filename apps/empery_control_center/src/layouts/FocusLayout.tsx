import { Outlet } from "react-router-dom";
import { LanguageSwitcher } from "@/features/shell/LanguageSwitcher";

/**
 * Full-stage focus for Wizard / Sandbox / Landing hero surfaces.
 */
export function FocusLayout() {
  return (
    <div className="ecc-stage relative flex h-full min-h-0 flex-col bg-field/40">
      <div className="absolute right-4 top-4 z-20">
        <LanguageSwitcher />
      </div>
      <Outlet />
    </div>
  );
}
