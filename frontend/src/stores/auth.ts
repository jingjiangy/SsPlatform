import { create } from "zustand";
import { persist } from "zustand/middleware";
import http from "@/api/http";

export type RoleCode = "admin" | "evaluator" | "rd" | "collector";

export type AppModule =
  | "roles"
  | "users"
  | "materials"
  | "eval"
  | "eval_templates"
  | "robots"
  | "device_models"
  | "parts"
  | "fault_records"
  | "api_docs";

function legacyModulesByRole(role: string): Set<AppModule> {
  const map: Record<string, Set<AppModule>> = {
    admin: new Set(["roles","users","materials","eval","eval_templates","robots","device_models","parts","fault_records","api_docs"]),
    evaluator: new Set(["users","materials","eval","eval_templates","robots","device_models","parts","fault_records","api_docs"]),
    rd: new Set(["materials","eval","eval_templates","robots","device_models","parts","fault_records","api_docs"]),
    collector: new Set(["materials","robots","device_models","parts","fault_records"]),
  };
  return map[role] ?? new Set();
}

interface AuthState {
  token: string | null;
  role: string | null;
  username: string | null;
  userId: string | null;
  modules: string[];
  perms: string[];
  isLoggedIn: boolean;
  setSession: (t: string, r: string, u: string, uid: string, mods?: string[], permList?: string[]) => void;
  logout: () => void;
  login: (username: string, password: string) => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      role: null,
      username: null,
      userId: null,
      modules: [],
      perms: [],
      isLoggedIn: false,

      setSession(t, r, u, uid, mods = [], permList = []) {
        set({ token: t, role: r, username: u, userId: uid, modules: mods, perms: permList, isLoggedIn: true });
      },

      logout() {
        set({ token: null, role: null, username: null, userId: null, modules: [], perms: [], isLoggedIn: false });
      },

      async login(usernameIn, password) {
        const { data } = await http.post("/api/auth/login", { username: usernameIn, password });
        const u = data.user as { id: string; username: string; role: string; modules?: string[]; perms?: string[] };
        set({
          token: data.access_token,
          role: u.role,
          username: u.username,
          userId: u.id,
          modules: Array.isArray(u.modules) ? u.modules : [],
          perms: Array.isArray(u.perms) ? u.perms : [],
          isLoggedIn: true,
        });
      },
    }),
    {
      name: "auth-storage",
      partialize: (s) => ({ token: s.token, role: s.role, username: s.username, userId: s.userId, modules: s.modules, perms: s.perms, isLoggedIn: s.isLoggedIn }),
    }
  )
);

function getModules(): string[] {
  try {
    const raw = localStorage.getItem("auth-storage");
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { state?: { modules?: string[] } };
    return Array.isArray(parsed?.state?.modules) ? parsed.state.modules : [];
  } catch { return []; }
}

function getPerms(): string[] {
  try {
    const raw = localStorage.getItem("auth-storage");
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { state?: { perms?: string[] } };
    return Array.isArray(parsed?.state?.perms) ? parsed.state.perms : [];
  } catch { return []; }
}

function getRole(): string {
  try {
    const raw = localStorage.getItem("auth-storage");
    if (!raw) return "";
    const parsed = JSON.parse(raw) as { state?: { role?: string } };
    return parsed?.state?.role ?? "";
  } catch { return ""; }
}

export function canSeeModule(mod: AppModule): boolean {
  const mods = getModules();
  if (mods.length > 0) return mods.includes(mod);
  return legacyModulesByRole(getRole()).has(mod);
}

export function canWriteMaterial(): boolean {
  const p = getPerms();
  if (p.length > 0) return p.includes("material:write");
  const r = getRole();
  return r === "admin" || r === "evaluator" || r === "rd";
}

export function canWriteEvalTemplate(): boolean {
  const p = getPerms();
  if (p.length > 0) return p.includes("eval_template:write");
  const r = getRole();
  return r === "admin" || r === "evaluator" || r === "rd";
}

export function canWriteRobot(): boolean {
  const p = getPerms();
  if (p.length > 0) return p.includes("robot:write");
  const r = getRole();
  return r === "admin" || r === "rd";
}

export function canWriteDeviceModel(): boolean {
  const p = getPerms();
  if (p.length > 0) return p.includes("device_model:write");
  const r = getRole();
  return r === "admin" || r === "rd";
}

export function canWritePart(): boolean {
  const p = getPerms();
  if (p.length > 0) return p.includes("part:write");
  const r = getRole();
  return r === "admin" || r === "rd";
}

export function canWriteFaultRecord(): boolean {
  const p = getPerms();
  if (p.length > 0) return p.includes("fault_record:write");
  const r = getRole();
  return r === "admin" || r === "rd";
}

export function getFirstAccessiblePath(): string {
  const pairs: [AppModule, string][] = [
    ["materials", "/materials"],
    ["eval", "/evaluations"],
    ["eval_templates", "/eval-templates"],
    ["device_models", "/device-models"],
    ["parts", "/parts"],
    ["fault_records", "/fault-records"],
    ["robots", "/robots"],
    ["users", "/users"],
    ["roles", "/roles"],
    ["api_docs", "/api-docs"],
  ];
  for (const [m, p] of pairs) {
    if (canSeeModule(m)) return p;
  }
  return "";
}
