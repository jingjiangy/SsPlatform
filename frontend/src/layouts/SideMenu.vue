<template>
  <div class="side-nav-inner">
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
          <el-menu-item v-if="show('eval')" index="/eval-templates">评测模板</el-menu-item>
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
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";
import { canSeeModule, type AppModule } from "@/stores/auth";

const route = useRoute();
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

function show(mod: AppModule) {
  return canSeeModule(mod);
}
</script>

<style scoped>
.side-nav-inner {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
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
</style>

<style>
.side-nav-inner .side-menu.el-menu {
  --el-menu-bg-color: transparent;
  --el-menu-hover-bg-color: transparent;
}
.side-nav-inner .side-menu .el-sub-menu .el-menu {
  background: transparent !important;
}
</style>
