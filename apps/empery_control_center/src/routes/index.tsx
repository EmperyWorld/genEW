import { Navigate, Route, Routes, useParams } from "react-router-dom";
/* eic:ui:asm_prod_acc_20261006110325 */
import { AsmProdAcc20261006110325Page } from "@/features/asm-prod-acc-20261006110325";
/* eic:ui:asm_prod_acc_20261006100320 */
import { AsmProdAcc20261006100320Page } from "@/features/asm-prod-acc-20261006100320";
/* eic:ui:loshkovskiy */
import { LoshkovskiyPage } from "@/features/loshkovskiy";
/* eic:ui:asm_c7_ops_20261006070638 */
import { AsmC7Ops20261006070638Page } from "@/features/asm-c7-ops-20261006070638";
/* eic:ui:dedmoroz */
import { DedmorozPage } from "@/features/dedmoroz";
/* eic:ui:ai_chat */
import { AiChatPage } from "@/features/ai-chat";
import { AppShell } from "@/layouts/AppShell";
import { CommandLayout } from "@/layouts/CommandLayout";
import { FocusLayout } from "@/layouts/FocusLayout";
import { ForgotPasswordPage } from "@/features/auth/ForgotPasswordPage";
import { LoginPage } from "@/features/auth/LoginPage";
import { RegisterPage } from "@/features/auth/RegisterPage";
import { ResetPasswordPage } from "@/features/auth/ResetPasswordPage";
import { OperatorsPage } from "@/features/operators/OperatorsPage";
import { LandingHero } from "@/routes/LandingHero";
import { ServiceWizardPage } from "@/features/service-wizard/ServiceWizardPage";
import { SandboxPage } from "@/features/sandbox/SandboxPage";
import { AutonomousPage } from "@/features/autonomous/AutonomousPage";
import { SystemHealthPage } from "@/features/system-health/SystemHealthPage";
import { PATHS } from "@/routes/paths";

function WizardRoute() {
  const { sessionId } = useParams<{ sessionId?: string }>();
  return <ServiceWizardPage sessionId={sessionId} />;
}

function SandboxRoute() {
  const { sessionId } = useParams<{ sessionId?: string }>();
  return <SandboxPage sessionId={sessionId} />;
}

export function AppRoutes() {
  return (
    <Routes>
      {/* Brand-first landing — no compact shell chrome */}
      <Route element={<FocusLayout />}>
        <Route index element={<LandingHero />} />
        <Route path="login" element={<LoginPage />} />
        <Route path="register" element={<RegisterPage />} />
        <Route path="forgot-password" element={<ForgotPasswordPage />} />
        <Route path="reset-password" element={<ResetPasswordPage />} />
      </Route>

      <Route element={<AppShell />}>
        <Route path="ops" element={<CommandLayout />}>
          <Route index element={null} />
          <Route path="map" element={null} />
          <Route path="console" element={null} />
          <Route path="feed" element={null} />
        </Route>

        <Route element={<FocusLayout />}>
          <Route path="ops/autonomous" element={<AutonomousPage />} />
          /* eic:ui:asm_prod_acc_20261006110325 */
          <Route path="ops/asm-prod-acc-20261006110325" element={<AsmProdAcc20261006110325Page />} />
          /* eic:ui:asm_prod_acc_20261006100320 */
          <Route path="ops/asm-prod-acc-20261006100320" element={<AsmProdAcc20261006100320Page />} />
          /* eic:ui:loshkovskiy */
          <Route path="ops/loshkovskiy" element={<LoshkovskiyPage />} />
          /* eic:ui:asm_c7_ops_20261006070638 */
          <Route path="ops/asm-c7-ops-20261006070638" element={<AsmC7Ops20261006070638Page />} />
          /* eic:ui:dedmoroz */
          <Route path="ops/dedmoroz" element={<DedmorozPage />} />
          /* eic:ui:ai_chat */
          <Route path="ops/ai-chat" element={<AiChatPage />} />
          <Route path="ops/health" element={<SystemHealthPage />} />
          <Route path="ops/operators" element={<OperatorsPage />} />
          <Route path="wizard" element={<WizardRoute />} />
          <Route path="wizard/:sessionId" element={<WizardRoute />} />
          <Route path="sandbox" element={<SandboxRoute />} />
          <Route path="sandbox/:sessionId" element={<SandboxRoute />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to={PATHS.home} replace />} />
    </Routes>
  );
}
