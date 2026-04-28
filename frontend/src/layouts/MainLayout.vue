<template>
  <el-container class="layout">
    <el-aside
      v-if="!isCompact"
      :width="asideWidth"
      class="aside"
      :class="{ 'aside--collapsed': asideCollapsed }"
    >
      <SideMenu />
    </el-aside>
    <el-drawer
      v-else
      v-model="drawerOpen"
      direction="ltr"
      :size="drawerWidth"
      :show-close="false"
      :with-header="false"
      append-to-body
      class="layout-nav-drawer"
    >
      <SideMenu />
    </el-drawer>
    <el-container class="main-col">
      <el-header class="header" height="56px">
        <div class="header-inner">
          <el-button
            :aria-label="toggleAriaLabel"
            class="side-toggle"
            type="primary"
            text
            @click="toggleAside"
          >
            <el-icon :size="22">
              <Expand v-if="asideCollapsed" />
              <Fold v-else />
            </el-icon>
          </el-button>
          <span class="user">{{ auth.username }}（{{ roleLabel }}）</span>
          <el-button type="primary" link @click="onLogout">退出</el-button>
        </div>
      </el-header>
      <el-main class="main">
        <div class="main-inner">
          <router-view />
        </div>
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup lang="ts">
import { Expand, Fold } from "@element-plus/icons-vue";
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useAuthStore } from "@/stores/auth";
import SideMenu from "./SideMenu.vue";

const COMPACT_MAX_CSS_PX = 1023;

const ASIDE_COLLAPSED_KEY = "main-layout-aside-collapsed";
const auth = useAuthStore();
const route = useRoute();
const router = useRouter();

const mqCompact = typeof window !== "undefined" ? window.matchMedia(`(max-width: ${COMPACT_MAX_CSS_PX}px)`) : null;
const isCompact = ref(mqCompact?.matches ?? false);

const asideCollapsed = ref(false);

const drawerOpen = computed({
  get: () => isCompact.value && !asideCollapsed.value,
  set: (open: boolean) => {
    if (!isCompact.value) return;
    asideCollapsed.value = !open;
  },
});

const drawerWidth = "min(280px, 86vw)";

let unsubscribeMq: (() => void) | undefined;

onMounted(() => {
  const raw = localStorage.getItem(ASIDE_COLLAPSED_KEY);
  if (raw === "1" || raw === "true") asideCollapsed.value = true;
  if (mqCompact?.matches) asideCollapsed.value = true;

  const onMq = () => {
    const next = mqCompact!.matches;
    if (next && !isCompact.value) asideCollapsed.value = true;
    isCompact.value = next;
  };
  mqCompact?.addEventListener("change", onMq);
  unsubscribeMq = () => mqCompact?.removeEventListener("change", onMq);
});

onUnmounted(() => {
  unsubscribeMq?.();
});

watch(asideCollapsed, (v) => {
  localStorage.setItem(ASIDE_COLLAPSED_KEY, v ? "1" : "0");
});

watch(
  () => route.fullPath,
  () => {
    if (isCompact.value) asideCollapsed.value = true;
  }
);

function toggleAside() {
  asideCollapsed.value = !asideCollapsed.value;
}

const asideWidth = computed(() => (asideCollapsed.value ? "0px" : "220px"));

const toggleAriaLabel = computed(() => {
  if (isCompact.value) return asideCollapsed.value ? "打开导航菜单" : "关闭导航菜单";
  return asideCollapsed.value ? "展开侧栏" : "收起侧栏";
});

const roleLabel = computed(() => {
  const m: Record<string, string> = {
    admin: "管理员",
    evaluator: "评测员",
    rd: "研发",
    collector: "采集员",
  };
  return m[auth.role || ""] || auth.role || "";
});

function onLogout() {
  auth.logout();
  router.push("/login");
}
</script>

<style scoped>
.layout {
  min-height: 100vh;
  min-height: 100dvh;
  height: 100vh;
  height: 100dvh;
  background: var(--app-main-bg);
}

.aside {
  display: flex;
  flex-direction: column;
  background: linear-gradient(180deg, var(--app-aside-bg) 0%, var(--app-aside-bg-end) 100%);
  border-right: 1px solid var(--app-aside-border);
  box-shadow: 4px 0 28px rgba(15, 23, 42, 0.08);
  flex-shrink: 0;
  overflow: hidden;
  transition:
    width 0.25s ease,
    min-width 0.25s ease,
    border-color 0.25s ease,
    box-shadow 0.25s ease;
}

.aside--collapsed {
  border-right-color: transparent;
  box-shadow: none;
  pointer-events: none;
}

.main-col {
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  background: linear-gradient(165deg, var(--app-main-bg) 0%, var(--app-main-bg-end) 55%, #fff 100%);
}

.header {
  flex-shrink: 0;
  padding: 0;
  height: 56px !important;
  background: var(--app-header-bg);
  border-bottom: 1px solid var(--app-header-border);
  box-shadow: var(--app-header-shadow);
  padding-left: env(safe-area-inset-left, 0);
  padding-right: env(safe-area-inset-right, 0);
}

.header-inner {
  height: 100%;
  width: 100%;
  box-sizing: border-box;
  padding: 0 var(--app-content-padding-x);
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
}

.side-toggle {
  margin-right: auto;
  color: var(--el-text-color-primary);
  min-width: 40px;
  min-height: 40px;
  padding: 8px;
  border-radius: 8px;
}

.side-toggle:hover {
  background: rgba(59, 130, 246, 0.08) !important;
  color: var(--el-color-primary) !important;
}

.main {
  flex: 1;
  min-height: 0;
  padding: 0;
  overflow: auto;
  background: transparent;
  -webkit-overflow-scrolling: touch;
}

.main-inner {
  width: 100%;
  box-sizing: border-box;
  padding: var(--app-content-padding-y) var(--app-content-padding-x);
  padding-bottom: calc(var(--app-content-padding-y) + env(safe-area-inset-bottom, 0));
  min-height: calc(100% - 8px);
}

/* 业务页根节点多为 el-card，保证拉满主内容宽度 */
.main-inner :deep(.el-card) {
  width: 100%;
  box-sizing: border-box;
}

.user {
  color: var(--el-text-color-regular);
  font-size: 14px;
}
</style>

<style>
/* 平板 / 手机：左侧抽屉导航与侧栏同款底色 */
.layout-nav-drawer.el-drawer {
  --el-drawer-padding-primary: 0;
  background: linear-gradient(180deg, var(--app-aside-bg) 0%, var(--app-aside-bg-end) 100%);
  box-shadow: 4px 0 28px rgba(15, 23, 42, 0.12);
}
.layout-nav-drawer .el-drawer__body {
  padding: 0;
  height: 100%;
  overflow: hidden;
  box-sizing: border-box;
  padding-left: env(safe-area-inset-left, 0);
}
.layout-nav-drawer-body {
  height: 100%;
  overflow: hidden;
}
</style>
