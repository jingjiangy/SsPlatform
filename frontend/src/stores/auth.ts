import { defineStore } from "pinia";
import { computed, ref } from "vue";
import http from "@/api/http";

export type RoleCode = "admin" | "evaluator" | "rd" | "collector";

/** 与后端 modules 字段一致 */
export type AppModule =
  | "roles"
  | "users"
  | "materials"
  | "eval"
  | "robots"
  | "device_models"
  | "parts"
  | "fault_records"
  | "api_docs";

function parseJsonArray(key: string): string[] {
  try {
    const s = localStorage.getItem(key);
    if (!s) return [];
    const j = JSON.parse(s) as unknown;
    return Array.isArray(j) ? j.map(String) : [];
  } catch {
    return [];
  }
}

/** 未写入 modules 的旧登录态：按角色编码推断菜单（升级后需重新登录以使用 JWT perms） */
function legacyModulesByRole(role: string): Set<AppModule> {
  const map: Record<string, Set<AppModule>> = {
    admin: new Set([
      "roles",
      "users",
      "materials",
      "eval",
      "robots",
      "device_models",
      "parts",
      "fault_records",
      "api_docs",
    ]),
    evaluator: new Set([
      "users",
      "materials",
      "eval",
      "robots",
      "device_models",
      "parts",
      "fault_records",
      "api_docs",
    ]),
    rd: new Set([
      "materials",
      "eval",
      "robots",
      "device_models",
      "parts",
      "fault_records",
      "api_docs",
    ]),
    collector: new Set(["materials", "robots", "device_models", "parts", "fault_records"]),
  };
  return map[role] ?? new Set();
}

export const useAuthStore = defineStore("auth", () => {
  const token = ref<string | null>(localStorage.getItem("token"));
  const role = ref<string | null>(localStorage.getItem("role"));
  const username = ref<string | null>(localStorage.getItem("username"));
  const userId = ref<string | null>(localStorage.getItem("userId"));
  const modules = ref<string[]>(parseJsonArray("modules"));
  const perms = ref<string[]>(parseJsonArray("perms"));

  const isLoggedIn = computed(() => !!token.value);

  function setSession(
    t: string,
    r: string,
    u: string,
    uid: string,
    mods?: string[],
    permList?: string[]
  ) {
    token.value = t;
    role.value = r;
    username.value = u;
    userId.value = uid;
    localStorage.setItem("token", t);
    localStorage.setItem("role", r);
    localStorage.setItem("username", u);
    localStorage.setItem("userId", uid);
    const m = mods ?? [];
    const p = permList ?? [];
    modules.value = m;
    perms.value = p;
    localStorage.setItem("modules", JSON.stringify(m));
    localStorage.setItem("perms", JSON.stringify(p));
  }

  function logout() {
    token.value = null;
    role.value = null;
    username.value = null;
    userId.value = null;
    modules.value = [];
    perms.value = [];
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    localStorage.removeItem("username");
    localStorage.removeItem("userId");
    localStorage.removeItem("modules");
    localStorage.removeItem("perms");
  }

  async function login(usernameIn: string, password: string) {
    const { data } = await http.post("/api/auth/login", { username: usernameIn, password });
    const u = data.user as {
      id: string;
      username: string;
      role: string;
      phone?: string;
      modules?: string[];
      perms?: string[];
    };
    setSession(
      data.access_token,
      u.role,
      u.username,
      u.id,
      Array.isArray(u.modules) ? u.modules : [],
      Array.isArray(u.perms) ? u.perms : []
    );
  }

  return { token, role, username, userId, modules, perms, isLoggedIn, setSession, logout, login };
});

export function canSeeModule(mod: AppModule): boolean {
  const mods = parseJsonArray("modules");
  if (mods.length > 0) {
    return mods.includes(mod);
  }
  const r = localStorage.getItem("role") || "";
  return legacyModulesByRole(r).has(mod);
}

export function canWriteMaterial(): boolean {
  const p = parseJsonArray("perms");
  if (p.length > 0) {
    return p.includes("material:write");
  }
  const r = localStorage.getItem("role") || "";
  return r === "admin" || r === "evaluator" || r === "rd";
}

export function canWriteRobot(): boolean {
  const p = parseJsonArray("perms");
  if (p.length > 0) {
    return p.includes("robot:write");
  }
  const r = localStorage.getItem("role") || "";
  return r === "admin" || r === "rd";
}

export function canWriteDeviceModel(): boolean {
  const p = parseJsonArray("perms");
  if (p.length > 0) {
    return p.includes("device_model:write");
  }
  const r = localStorage.getItem("role") || "";
  return r === "admin" || r === "rd";
}

export function canWritePart(): boolean {
  const p = parseJsonArray("perms");
  if (p.length > 0) {
    return p.includes("part:write");
  }
  const r = localStorage.getItem("role") || "";
  return r === "admin" || r === "rd";
}

export function canWriteFaultRecord(): boolean {
  const p = parseJsonArray("perms");
  if (p.length > 0) {
    return p.includes("fault_record:write");
  }
  const r = localStorage.getItem("role") || "";
  return r === "admin" || r === "rd";
}

/** 用于无权限访问当前页时的回退跳转（按常见顺序取第一个可见模块） */
export function getFirstAccessiblePath(): string {
  const pairs: [AppModule, string][] = [
    ["materials", "/materials"],
    ["eval", "/evaluations"],
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
