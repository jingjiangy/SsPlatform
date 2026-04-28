<template>
  <div class="lazy-table-video">
    <video
      v-if="activated"
      :src="src"
      class="table-video"
      controls
      playsinline
      preload="metadata"
    />
    <button
      v-else
      type="button"
      class="lazy-table-video-placeholder"
      @click="onActivate"
    >
      <span class="lazy-table-video-placeholder__icon" aria-hidden="true">▶</span>
      <span>点击加载视频</span>
    </button>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";

const props = defineProps<{
  /** 已解析的完整可播放地址 */
  src: string;
}>();

const activated = ref(false);

function onActivate() {
  if (!props.src) return;
  activated.value = true;
}

watch(
  () => props.src,
  () => {
    activated.value = false;
  }
);
</script>

<style scoped>
.lazy-table-video {
  min-height: 72px;
}

.table-video {
  display: block;
  width: 200px;
  max-width: 100%;
  max-height: 120px;
  border-radius: 4px;
  background: #000;
  object-fit: contain;
  vertical-align: middle;
}

.lazy-table-video-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 200px;
  max-width: 100%;
  min-height: 72px;
  max-height: 120px;
  box-sizing: border-box;
  margin: 0;
  padding: 10px 8px;
  border-radius: 4px;
  background: #f1f5f9;
  border: 1px dashed rgba(15, 23, 42, 0.2);
  font-size: 12px;
  color: var(--el-text-color-secondary);
  cursor: pointer;
  font-family: inherit;
  line-height: 1.3;
  transition:
    background 0.15s ease,
    border-color 0.15s ease,
    color 0.15s ease;
}

.lazy-table-video-placeholder:hover {
  background: #e8eef6;
  border-color: rgba(59, 130, 246, 0.45);
  color: var(--el-color-primary);
}

.lazy-table-video-placeholder:focus-visible {
  outline: 2px solid var(--el-color-primary);
  outline-offset: 2px;
}

.lazy-table-video-placeholder__icon {
  font-size: 18px;
  line-height: 1;
  opacity: 0.75;
}
</style>
