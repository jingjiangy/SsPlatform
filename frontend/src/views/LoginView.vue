<template>
  <div class="wrap">
    <div class="bg-decoration" aria-hidden="true" />
    <el-card class="card" shadow="hover">
      <div class="card-head">
        <span class="logo-dot" />
        <h2>登录</h2>
        <p class="tagline">模型评估平台</p>
      </div>
      <el-form :model="form" @submit.prevent="onSubmit">
        <el-form-item label="用户名">
          <el-input v-model="form.username" autocomplete="username" />
        </el-form-item>
        <el-form-item label="密码">
          <el-input v-model="form.password" type="password" autocomplete="current-password" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" native-type="submit" :loading="loading" style="width: 100%">登录</el-button>
        </el-form-item>
      </el-form>
      <p class="hint">默认管理员：admin / admin123（首次启动自动创建）</p>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { ElMessage } from "element-plus";
import { useAuthStore } from "@/stores/auth";

const auth = useAuthStore();
const router = useRouter();
const route = useRoute();
const loading = ref(false);
const form = reactive({ username: "", password: "" });

async function onSubmit() {
  loading.value = true;
  try {
    await auth.login(form.username, form.password);
    const redirect = (route.query.redirect as string) || "/materials";
    router.replace(redirect);
  } catch (e: unknown) {
    ElMessage.error("登录失败");
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.wrap {
  position: relative;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: linear-gradient(
    145deg,
    var(--app-login-bg-1) 0%,
    var(--app-login-bg-2) 42%,
    #ffffff 100%
  );
  overflow: hidden;
}

.bg-decoration {
  position: absolute;
  inset: -20% -10% auto;
  height: 70%;
  background: radial-gradient(ellipse 80% 60% at 50% 0%, var(--app-login-accent), transparent 70%);
  pointer-events: none;
}

.card {
  position: relative;
  width: 100%;
  max-width: 420px;
  border-radius: 12px;
  border: 1px solid rgba(15, 23, 42, 0.06);
  box-shadow: 0 24px 48px rgba(15, 23, 42, 0.08), 0 2px 8px rgba(15, 23, 42, 0.04);
}

.card-head {
  text-align: center;
  margin-bottom: 8px;
}

.logo-dot {
  display: inline-block;
  width: 8px;
  height: 32px;
  border-radius: 4px;
  margin-bottom: 12px;
  background: linear-gradient(180deg, #60a5fa, #2563eb);
  box-shadow: 0 4px 16px rgba(37, 99, 235, 0.35);
}

.card :deep(h2) {
  margin: 0 0 4px;
  font-size: 22px;
  font-weight: 700;
  color: #0f172a;
  letter-spacing: 0.02em;
}

.tagline {
  margin: 0 0 20px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.hint {
  font-size: 12px;
  color: var(--app-text-hint);
  margin: 16px 0 0;
  line-height: 1.5;
}

.card :deep(.el-form-item__label) {
  color: var(--el-text-color-regular);
}
</style>
