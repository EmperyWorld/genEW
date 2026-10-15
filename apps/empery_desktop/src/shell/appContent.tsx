import type { WindowState } from "./types";
import { APP_MOUNTS } from "./mounts/registry";

type Props = {
  win: WindowState;
};

/** App mount dispatcher — scaffolds register into APP_MOUNTS. */
export function AppWindowContent({ win }: Props) {
  // Legacy seed used type=folder for Workspace before it became an app mount.
  if (
    win.type === "folder" &&
    (win.itemId === "folder-workspace" ||
      win.itemId === "app-workspace" ||
      win.title === "Workspace")
  ) {
    const Mount = APP_MOUNTS.workspace;
    if (Mount) return <Mount win={win} />;
  }

  if (win.type === "folder") {
    return (
      <div className="space-y-2 text-sm text-ink-muted">
        <p className="font-display text-ink">Folder</p>
        <p>Explorer for <code>{win.title}</code> — file tree mounts next.</p>
      </div>
    );
  }

  const Mount = win.appComponent ? APP_MOUNTS[win.appComponent] : undefined;
  if (Mount) {
    return <Mount win={win} />;
  }

  return (
    <div className="space-y-2 text-sm text-ink-muted">
      <p className="font-display text-ink">{win.title}</p>
      <p>
        Mount for <code>{win.appComponent ?? "unknown"}</code> — register via
        scaffold desktop pack.
      </p>
    </div>
  );
}
