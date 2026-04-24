<template>
  <el-card class="docs-card" shadow="never">
    <template #header>
      <div class="hdr">
        <span>接口文档（OpenAPI）</span>
        <div class="tools">
          <el-radio-group v-model="mode" size="small">
            <el-radio-button value="swagger">Swagger UI</el-radio-button>
            <el-radio-button value="redoc">ReDoc</el-radio-button>
          </el-radio-group>
          <el-button type="primary" link tag="a" :href="frameSrc" target="_blank" rel="noopener">
            新窗口打开
          </el-button>
        </div>
      </div>
    </template>
    <p class="hint">
      与接口请求同源规则一致：未配置 <code>VITE_API_BASE</code> 时使用当前站点下的
      <code>/docs</code>（开发环境需在 Vite 中代理到后端）。
    </p>
    <iframe :key="frameSrc" class="doc-frame" title="API 文档" :src="frameSrc" />
  </el-card>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";

const mode = ref<"swagger" | "redoc">("swagger");

/** 与 axios 一致：有 base 则文档也在该 origin；否则走当前页同源（配合反向代理） */
const apiBase = (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, "") ?? "";

const frameSrc = computed(() => {
  const base = apiBase || "";
  const path = mode.value === "swagger" ? "/docs" : "/redoc";
  return `${base}${path}`;
});
</script>

<style scoped>
.docs-card {
  height: calc(100vh - 56px - 72px);
  display: flex;
  flex-direction: column;
}
.docs-card :deep(.el-card__body) {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding-top: 0;
}
.hdr {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.tools {
  display: flex;
  align-items: center;
  gap: 12px;
}
.hint {
  margin: 0 0 8px;
  font-size: 12px;
  color: var(--app-text-hint);
  line-height: 1.5;
}
.doc-frame {
  flex: 1;
  width: 100%;
  min-height: 480px;
  border: 1px solid var(--el-border-color);
  border-radius: 4px;
  background: #fff;
}
</style>
