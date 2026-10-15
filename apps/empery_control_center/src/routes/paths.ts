export const PATHS = {
  home: "/",
  login: "/login",
  register: "/register",
  forgotPassword: "/forgot-password",
  resetPassword: "/reset-password",
  ops: "/ops",
  opsMap: "/ops/map",
  opsConsole: "/ops/console",
  opsFeed: "/ops/feed",
  opsAutonomous: "/ops/autonomous",
  opsHealth: "/ops/health",
  opsOperators: "/ops/operators",
  wizard: "/wizard",
  wizardSession: (sessionId: string) => `/wizard/${sessionId}`,
  sandbox: "/sandbox",
  sandboxSession: (sessionId: string) => `/sandbox/${sessionId}`,
  // eic:ui:ai_chat
  opsAiChat: "/ops/ai-chat",
  // eic:ui:dedmoroz
  opsDedmoroz: "/ops/dedmoroz",
  // eic:ui:asm_c7_ops_20261006070638
  opsAsmC7Ops20261006070638: "/ops/asm-c7-ops-20261006070638",
  // eic:ui:loshkovskiy
  opsLoshkovskiy: "/ops/loshkovskiy",
  // eic:ui:asm_prod_acc_20261006100320
  opsAsmProdAcc20261006100320: "/ops/asm-prod-acc-20261006100320",
  // eic:ui:asm_prod_acc_20261006110325
  opsAsmProdAcc20261006110325: "/ops/asm-prod-acc-20261006110325",
} as const;
