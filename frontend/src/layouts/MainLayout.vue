<template>
  <el-container class="layout">
    <el-aside width="220px" class="aside">
      <div class="brand">
        <span class="brand-mark" aria-hidden="true" />
        <div class="brand-text">
          <span class="brand-title">模型评估平台</span>
          <span class="brand-sub">世界模型 · 评测</span>
        </div>
      </div>
      <el-scrollbar class="aside-scroll">
        <el-menu
          class="side-menu"
          :default-active="active"
          router
          :default-openeds="['system', 'world', 'device']"
          background-color="transparent"
          text-color="#e2e8f0"
          active-text-color="#ffffff"
        >
          <el-sub-menu v-if="showSystemGroup" index="system">
            <template #title>
              <span class="sub-title">系统管理</span>
            </template>
            <el-menu-item v-if="show('roles')" index="/roles">角色管理</el-menu-item>
            <el-menu-item v-if="show('users')" index="/users">账号管理</el-menu-item>
          </el-sub-menu>
          <el-sub-menu v-if="showWorldGroup" index="world">
            <template #title>
              <span class="sub-title">世界模型素材库</span>
            </template>
            <el-menu-item v-if="show('materials')" index="/materials">素材库</el-menu-item>
            <el-menu-item v-if="show('eval')" index="/evaluations">评测记录</el-menu-item>
          </el-sub-menu>
          <el-sub-menu v-if="showDeviceGroup" index="device">
            <template #title>
              <span class="sub-title">设备管理</span>
            </template>
            <el-menu-item v-if="show('device_models')" index="/device-models">设备型号</el-menu-item>
            <el-menu-item v-if="show('robots')" index="/robots">机器人管理</el-menu-item>
            <el-menu-item v-if="show('parts')" index="/parts">配件管理</el-menu-item>
            <el-menu-item v-if="show('fault_records')" index="/fault-records">故障记录</el-menu-item>
          </el-sub-menu>
          <el-menu-item v-if="canSeeModule('api_docs')" index="/api-docs" class="single-item">
            接口文档
          </el-menu-item>
        </el-menu>
      </el-scrollbar>
    </el-aside>
    <el-container class="main-col">
      <el-header class="header" height="56px">
        <div class="header-inner">
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
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useAuthStore, canSeeModule, type AppModule } from "@/stores/auth";

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();

const active = computed(() => route.path.split("?")[0]);

const showSystemGroup = computed(() => canSeeModule("roles") || canSeeModule("users"));
const showWorldGroup = computed(() => canSeeModule("materials") || canSeeModule("eval"));
const showDeviceGroup = computed(
  () =>
    canSeeModule("robots") ||
    canSeeModule("device_models") ||
    canSeeModule("parts") ||
    canSeeModule("fault_records")
);

const roleLabel = computed(() => {
  const m: Record<string, string> = {
    admin: "管理员",
    evaluator: "评测员",
    rd: "研发",
    collector: "采集员",
  };
  return m[auth.role || ""] || auth.role || "";
});

function show(mod: AppModule) {
  return canSeeModule(mod);
}

function onLogout() {
  auth.logout();
  router.push("/login");
}
</script>

<style scoped>
.layout {
  height: 100vh;
  min-height: 100vh;
  background: var(--app-main-bg);
}

.aside {
  display: flex;
  flex-direction: column;
  background: linear-gradient(180deg, var(--app-aside-bg) 0%, var(--app-aside-bg-end) 100%);
  border-right: 1px solid var(--app-aside-border);
  box-shadow: 4px 0 28px rgba(15, 23, 42, 0.08);
}

.brand {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 20px 18px 18px;
  border-bottom: 1px solid var(--app-aside-border);
}

.brand-mark {
  width: 10px;
  height: 36px;
  border-radius: 4px;
  background: linear-gradient(180deg, #7dd3fc 0%, #3b82f6 100%);
  box-shadow: 0 0 16px rgba(59, 130, 246, 0.35);
}

.brand-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.brand-title {
  font-weight: 700;
  font-size: 15px;
  letter-spacing: 0.02em;
  color: #f1f5f9;
  line-height: 1.3;
}

.brand-sub {
  font-size: 11px;
  color: var(--app-aside-text);
  opacity: 0.9;
}

.aside-scroll {
  flex: 1;
  min-height: 0;
}

.aside-scroll :deep(.el-scrollbar__wrap) {
  overflow-x: hidden;
}

.side-menu {
  border-right: none !important;
  padding: 10px 8px 20px;
}

.side-menu :deep(.el-sub-menu__title) {
  height: 44px;
  line-height: 44px;
  border-radius: 8px;
  margin-top: 4px;
  font-size: 13px;
  color: #e2e8f0 !important;
}

.side-menu :deep(.el-sub-menu__title:hover) {
  background: var(--app-aside-hover) !important;
}

.side-menu :deep(.el-menu-item) {
  height: 40px;
  line-height: 40px;
  border-radius: 8px;
  margin: 2px 0;
  font-size: 14px;
}

.side-menu :deep(.el-menu-item:hover) {
  background: var(--app-aside-hover) !important;
}

.side-menu :deep(.el-menu-item.is-active) {
  background: var(--app-aside-bg-elevated) !important;
  color: var(--app-aside-text-active) !important;
  font-weight: 600;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.22);
}

.side-menu :deep(.el-menu--inline) {
  background: transparent !important;
}

.side-menu :deep(.el-menu--inline .el-menu-item) {
  padding-left: 44px !important;
}

.sub-title {
  font-weight: 600;
  letter-spacing: 0.03em;
}

.single-item {
  margin-top: 8px;
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

.main {
  flex: 1;
  min-height: 0;
  padding: 0;
  overflow: auto;
  background: transparent;
}

.main-inner {
  width: 100%;
  box-sizing: border-box;
  padding: var(--app-content-padding-y) var(--app-content-padding-x);
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
/* 侧栏菜单：覆盖 Element Plus 默认浅色背景 */
.layout .side-menu.el-menu {
  --el-menu-bg-color: transparent;
  --el-menu-hover-bg-color: transparent;
}
.layout .side-menu .el-sub-menu .el-menu {
  background: transparent !important;
}
</style>
