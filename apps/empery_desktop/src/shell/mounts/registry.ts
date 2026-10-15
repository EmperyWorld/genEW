import type { ComponentType } from "react";
import type { WindowState } from "@/shell/types";
import { AutonomousMount } from "./autonomous";
import { ControlCenterMount } from "./control_center";
import { DocEditorMount } from "./doc_editor";
import { ImageStudioMount } from "./image_studio";
import { EwaCompanionMount } from "./ewa_companion";
import { MusicForgeMount } from "./music_forge";
import { SiteStudioMount } from "./site_studio";
import { VideoStudioMount } from "./video_studio";
import { WorkspaceMount } from "./workspace";
import { AiChatMount } from "./ai_chat";
import { DedmorozMount } from "./dedmoroz";
import { AsmC7Ops20261006070638Mount } from "./asm_c7_ops_20261006070638";
import { LoshkovskiyMount } from "./loshkovskiy";
import { AsmProdAcc20261006100320Mount } from "./asm_prod_acc_20261006100320";
import { AsmProdAcc20261006110325Mount } from "./asm_prod_acc_20261006110325";
export type MountProps = { win: WindowState };
export type AppMount = ComponentType<MountProps>;

/**
 * Desktop app mounts. Scaffold appends entries between eic markers.
 * Do not import EliteEW here — adapt parts into Empery mounts.
 */
export const APP_MOUNTS: Record<string, AppMount> = {
  control_center: ControlCenterMount,
  autonomous: AutonomousMount,
  doc_editor: DocEditorMount,
  image_studio: ImageStudioMount,
  video_studio: VideoStudioMount,
  music_forge: MusicForgeMount,
  ewa_companion: EwaCompanionMount,
  site_studio: SiteStudioMount,
  workspace: WorkspaceMount,
  ai_chat: AiChatMount,
  dedmoroz: DedmorozMount,
    asm_c7_ops_20261006070638: AsmC7Ops20261006070638Mount,
    loshkovskiy: LoshkovskiyMount,
    asm_prod_acc_20261006100320: AsmProdAcc20261006100320Mount,
    asm_prod_acc_20261006110325: AsmProdAcc20261006110325Mount,
  // eic:desktop-mount-registry
};

