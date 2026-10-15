import { FormEvent, useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Shield } from "lucide-react";
import {
  identityClient,
  type AssignableRole,
  type EccRoleItem,
} from "@/api/identityClient";
import { EccApiError } from "@/api/http";
import { Button } from "@/components/Button";
import { RequireAuth } from "@/features/auth/RequireAuth";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function roleLabelKey(name: string): string {
  if (name === "operator") return "operators.roleOperator";
  if (name === "member") return "operators.roleMember";
  if (name === "admin") return "operators.roleAdmin";
  if (name === "viewer") return "operators.roleViewer";
  return name;
}

function OperatorsPageInner() {
  const { t } = useTranslation();
  const [roles, setRoles] = useState<EccRoleItem[]>([]);
  const [loadingRoles, setLoadingRoles] = useState(true);
  const [rolesError, setRolesError] = useState<string | null>(null);

  const [userRef, setUserRef] = useState("");
  const [role, setRole] = useState<AssignableRole>("operator");
  const [assignError, setAssignError] = useState<string | null>(null);
  const [assignSuccess, setAssignSuccess] = useState<string | null>(null);
  const [assigning, setAssigning] = useState(false);

  const loadRoles = useCallback(async () => {
    setLoadingRoles(true);
    setRolesError(null);
    try {
      const res = await identityClient.listRoles();
      setRoles(res.roles ?? []);
    } catch (err) {
      if (err instanceof EccApiError) {
        setRolesError(err.message);
      } else {
        setRolesError(t("operators.loadError"));
      }
      setRoles([]);
    } finally {
      setLoadingRoles(false);
    }
  }, [t]);

  useEffect(() => {
    void loadRoles();
  }, [loadRoles]);

  async function onAssign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAssignError(null);
    setAssignSuccess(null);

    const trimmed = userRef.trim();
    let userId = trimmed;

    if (trimmed.includes("@")) {
      setAssigning(true);
      try {
        const user = await identityClient.lookupByEmail(trimmed);
        userId = user.id;
      } catch (err) {
        if (err instanceof EccApiError && err.status === 404) {
          setAssignError(t("operators.userNotFound"));
        } else if (err instanceof EccApiError) {
          setAssignError(err.message);
        } else {
          setAssignError(t("operators.userNotFound"));
        }
        setAssigning(false);
        return;
      }
    } else if (!UUID_RE.test(trimmed)) {
      setAssignError(t("operators.invalidUserId"));
      return;
    }

    setAssigning(true);
    try {
      const res = await identityClient.assignRole(userId, role);
      setAssignSuccess(
        t("operators.assignSuccess", {
          email: res.user.email,
          role: t(roleLabelKey(role)),
        }),
      );
      setUserRef("");
    } catch (err) {
      if (err instanceof EccApiError) {
        setAssignError(err.message);
      } else {
        setAssignError(t("operators.assignError"));
      }
    } finally {
      setAssigning(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-6 py-10">
      <header className="space-y-2">
        <div className="flex items-center gap-2 text-signal">
          <Shield size={18} strokeWidth={1.5} aria-hidden />
          <h1 className="font-display text-xl font-semibold text-ink">
            {t("operators.title")}
          </h1>
        </div>
        <p className="max-w-xl font-body text-sm text-ink-muted">
          {t("operators.subtitle")}
        </p>
      </header>

      <section aria-labelledby="roles-heading" className="space-y-3">
        <h2
          id="roles-heading"
          className="font-body text-xs font-medium uppercase tracking-wide text-ink-faint"
        >
          {t("operators.rolesHeading")}
        </h2>
        <div className="rounded-lg border border-line bg-panel/60 px-4">
          {loadingRoles ? (
            <p className="py-6 text-center font-body text-sm text-ink-muted">
              {t("common.loading")}
            </p>
          ) : rolesError ? (
            <p className="py-6 text-center font-body text-sm text-red-400" role="alert">
              {rolesError}
            </p>
          ) : roles.length === 0 ? (
            <p className="py-6 text-center font-body text-sm text-ink-muted">
              {t("operators.noRoles")}
            </p>
          ) : (
            roles.map((item) => (
              <div
                key={item.id}
                className="flex flex-wrap items-start justify-between gap-3 border-b border-line py-3 last:border-b-0"
              >
                <div>
                  <p className="font-body text-sm font-medium text-ink">
                    {t(roleLabelKey(item.name))}
                  </p>
                  <p className="font-mono text-[11px] text-ink-faint">{item.name}</p>
                </div>
                <p className="max-w-md text-right font-body text-xs text-ink-muted">
                  {item.permissions.length > 0
                    ? item.permissions.join(", ")
                    : t("common.dash")}
                </p>
              </div>
            ))
          )}
        </div>
      </section>

      <section aria-labelledby="assign-heading" className="space-y-3">
        <h2
          id="assign-heading"
          className="font-body text-xs font-medium uppercase tracking-wide text-ink-faint"
        >
          {t("operators.assignHeading")}
        </h2>
        <form
          onSubmit={onAssign}
          className="space-y-4 rounded-lg border border-line bg-panel/60 p-4"
        >
          <label className="block space-y-1.5">
            <span className="font-body text-sm text-ink-muted">
              {t("operators.userRef")}
            </span>
            <input
              type="text"
              required
              value={userRef}
              onChange={(e) => setUserRef(e.target.value)}
              placeholder={t("operators.userRefPlaceholder")}
              className="w-full rounded-md border border-line bg-field px-3 py-2 font-body text-sm text-ink outline-none focus:border-signal"
            />
          </label>

          <label className="block space-y-1.5">
            <span className="font-body text-sm text-ink-muted">
              {t("operators.roleSelect")}
            </span>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as AssignableRole)}
              className="w-full rounded-md border border-line bg-field px-3 py-2 font-body text-sm text-ink outline-none focus:border-signal"
            >
              <option value="admin">{t("operators.roleAdmin")}</option>
              <option value="operator">{t("operators.roleOperator")}</option>
              <option value="member">{t("operators.roleMember")}</option>
              <option value="viewer">{t("operators.roleViewer")}</option>
            </select>
          </label>

          {assignError ? (
            <p className="font-body text-sm text-red-400" role="alert">
              {assignError}
            </p>
          ) : null}

          {assignSuccess ? (
            <p
              className="rounded-md border border-signal/30 bg-signal-soft px-4 py-3 font-body text-sm text-ink"
              role="status"
            >
              {assignSuccess}
            </p>
          ) : null}

          <Button type="submit" disabled={assigning}>
            {assigning ? t("operators.assigning") : t("operators.assignSubmit")}
          </Button>
        </form>
      </section>
    </div>
  );
}

export function OperatorsPage() {
  return (
    <RequireAuth>
      <OperatorsPageInner />
    </RequireAuth>
  );
}
