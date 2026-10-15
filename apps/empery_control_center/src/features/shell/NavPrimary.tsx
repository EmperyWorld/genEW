import { NavLink } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  LayoutGrid,
  Wand2,
  FlaskConical,
  Bot,
  Activity,
  Shield,
  MessageSquare,
  Snowflake,
  Notebook,
} from "lucide-react";
import { PATHS } from "@/routes/paths";
import { cn } from "@/lib/cn";

/**
 * Primary ops nav — product surfaces only.
 * Probe / lab modules (manifest.ui.required=false or ui.lab) stay routable via
 * deep link but must not appear here (P4.1/P4.3: nav ⇒ ui.required).
 */
export function NavPrimary() {
  const { t } = useTranslation();

  const links: Array<{
    to: string;
    label: string;
    icon: typeof LayoutGrid;
    end?: boolean;
  }> = [
    { to: PATHS.ops, label: t("nav.ops"), icon: LayoutGrid, end: true },
    { to: PATHS.opsAutonomous, label: t("nav.autonomous"), icon: Bot },
    { to: PATHS.opsHealth, label: t("nav.health"), icon: Activity },
    { to: PATHS.opsOperators, label: t("nav.operators"), icon: Shield },
    { to: PATHS.wizard, label: t("nav.wizard"), icon: Wand2 },
    { to: PATHS.sandbox, label: t("nav.sandbox"), icon: FlaskConical },
    /* eic:ui:ai_chat */
    { to: PATHS.opsAiChat, label: t("nav.aiChat"), icon: MessageSquare },
    /* eic:ui:dedmoroz */
    { to: PATHS.opsDedmoroz, label: t("nav.dedmoroz"), icon: Snowflake },
    // P10: smoke goldens (p4_golden_*/p8_notes_*) stay deep-linkable via routes,
    // but are omitted from primary nav (lab debris).

    /* eic:ui:asm_c7_ops_20261006070638 */
    { to: PATHS.opsAsmC7Ops20261006070638, label: t("nav.asmC7Ops20261006070638"), icon: Notebook },

    /* eic:ui:loshkovskiy */
    { to: PATHS.opsLoshkovskiy, label: t("nav.loshkovskiy"), icon: Notebook },

    /* eic:ui:asm_prod_acc_20261006100320 */
    { to: PATHS.opsAsmProdAcc20261006100320, label: t("nav.asmProdAcc20261006100320"), icon: Notebook },

    /* eic:ui:asm_prod_acc_20261006110325 */
    { to: PATHS.opsAsmProdAcc20261006110325, label: t("nav.asmProdAcc20261006110325"), icon: Notebook },

  ];

  return (
    <nav aria-label={t("nav.primary")} className="flex flex-wrap items-center gap-1">
      {links.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={Boolean(end)}
          className={({ isActive }) =>
            cn(
              "inline-flex items-center gap-2 whitespace-normal px-3 py-2 text-sm font-body transition-colors",
              "rounded-md border border-transparent",
              isActive
                ? "border-line bg-signal-soft text-signal"
                : "text-ink-muted hover:border-line hover:text-ink",
            )
          }
        >
          <Icon size={16} strokeWidth={1.5} aria-hidden className="shrink-0" />
          {label}
        </NavLink>
      ))}
    </nav>
  );
}
