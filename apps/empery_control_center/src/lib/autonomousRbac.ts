/** Roles that may mutate Autonomous state (member kept for backward compatibility). */
const AUTONOMOUS_WRITE_ROLES = new Set(["admin", "operator", "member"]);

export function canAutonomousWrite(roles: string[] | undefined): boolean {
  if (!roles?.length) return false;
  return roles.some((role) => AUTONOMOUS_WRITE_ROLES.has(role));
}
