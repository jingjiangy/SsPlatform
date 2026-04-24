<template>
  <el-card>
    <template #header>
      <div class="row">
        <span>角色管理</span>
        <el-button type="primary" @click="openAdd">添加角色</el-button>
      </div>
    </template>
    <el-table :data="items" border stripe row-key="_id">
      <el-table-column label="序号" width="72" align="center">
        <template #default="{ $index }">{{ revIdx($index) }}</template>
      </el-table-column>
      <el-table-column prop="_id" label="角色ID" width="200" />
      <el-table-column prop="name" label="名称" />
      <el-table-column prop="code" label="编码" />
      <el-table-column prop="description" label="描述" show-overflow-tooltip min-width="120" />
      <el-table-column label="模块权限" min-width="200">
        <template #default="{ row }">
          <el-tag v-for="m in moduleLabels(row)" :key="m" size="small" class="tag">{{ m }}</el-tag>
          <span v-if="!moduleLabels(row).length" class="muted">—</span>
        </template>
      </el-table-column>
      <el-table-column label="创建时间" width="180">
        <template #default="{ row }">{{ formatDateTime(row.created_at) }}</template>
      </el-table-column>
      <el-table-column label="更新时间" width="180">
        <template #default="{ row }">{{ formatDateTime(row.updated_at) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="160" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="openEdit(row)">修改</el-button>
          <el-button link type="danger" @click="remove(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>
    <el-pagination
      v-model:current-page="page"
      v-model:page-size="pageSize"
      :total="total"
      :page-sizes="[10, 20, 50, 100]"
      layout="total, sizes, prev, pager, next, jumper"
      class="table-pager"
    />

    <el-dialog v-model="dlg" :title="dlgTitle" width="600px" @closed="resetForm">
      <el-form :model="form" label-width="100px">
        <el-form-item label="名称" required>
          <el-input v-model="form.name" :disabled="mode === 'edit'" />
        </el-form-item>
        <el-form-item v-if="mode === 'add'" label="编码" required>
          <el-input v-model="form.code" placeholder="如 custom_role" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="form.description" type="textarea" />
        </el-form-item>
        <el-form-item label="模块权限" required>
          <el-checkbox-group v-model="form.modules">
            <el-checkbox v-for="o in ROLE_MODULE_OPTIONS" :key="o.value" :label="o.value">
              {{ o.label }}
            </el-checkbox>
          </el-checkbox-group>
          <p class="hint">勾选后，使用该角色的账号登录才可看到对应菜单；接口权限与登录令牌一并下发。</p>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dlg = false">取消</el-button>
        <el-button type="primary" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </el-card>
</template>

<script setup lang="ts">
import { reactive, ref, computed, watch } from "vue";
import http from "@/api/http";
import { ElMessage, ElMessageBox } from "element-plus";
import { formatDateTime } from "@/utils/datetime";
import { ROLE_MODULE_OPTIONS } from "@/constants/options";
import { DEFAULT_PAGE_SIZE, reverseSerialIndex, skipForPage } from "@/utils/pagination";

const items = ref<Record<string, unknown>[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(DEFAULT_PAGE_SIZE);
const skip = computed(() => skipForPage(page.value, pageSize.value));

function revIdx($index: number) {
  return reverseSerialIndex(total.value, skip.value, $index);
}
const dlg = ref(false);
const mode = ref<"add" | "edit">("add");
const editingId = ref<string | null>(null);
const form = reactive({
  name: "",
  code: "",
  description: "",
  modules: [] as string[],
});

const dlgTitle = computed(() => (mode.value === "add" ? "添加角色" : "修改角色"));

const moduleLabelMap = Object.fromEntries(ROLE_MODULE_OPTIONS.map((o) => [o.value, o.label]));

function moduleLabels(row: Record<string, unknown>): string[] {
  const raw = row.modules;
  if (!Array.isArray(raw)) return [];
  return raw.map((x) => moduleLabelMap[String(x)] || String(x)).filter(Boolean);
}

async function load() {
  const { data } = await http.get("/api/roles", {
    params: { skip: skip.value, limit: pageSize.value },
  });
  const list = (data.items || []) as Record<string, unknown>[];
  const t = Number((data as { total?: number }).total);
  if (list.length === 0 && t > 0 && page.value > 1) {
    page.value = 1;
    return load();
  }
  items.value = list;
  total.value = Number.isFinite(t) ? t : 0;
}

function openAdd() {
  mode.value = "add";
  editingId.value = null;
  resetForm();
  dlg.value = true;
}

function openEdit(row: Record<string, unknown>) {
  mode.value = "edit";
  editingId.value = String(row._id);
  form.name = String(row.name);
  form.code = String(row.code);
  form.description = String(row.description || "");
  const m = row.modules;
  form.modules = Array.isArray(m) ? m.map(String) : [];
  dlg.value = true;
}

function resetForm() {
  form.name = "";
  form.code = "";
  form.description = "";
  form.modules = [];
}

async function save() {
  if (!form.modules.length) {
    ElMessage.warning("请至少勾选一个系统模块权限");
    return;
  }
  if (mode.value === "add") {
    await http.post("/api/roles", {
      name: form.name,
      code: form.code,
      description: form.description,
      modules: form.modules,
    });
  } else if (editingId.value) {
    await http.put(`/api/roles/${editingId.value}`, {
      name: form.name,
      description: form.description,
      modules: form.modules,
    });
  }
  dlg.value = false;
  ElMessage.success("已保存");
  await load();
}

async function remove(row: Record<string, unknown>) {
  await ElMessageBox.confirm("确定删除该角色？", "删除", { type: "warning" });
  await http.delete(`/api/roles/${row._id}`);
  ElMessage.success("已删除");
  await load();
}

watch(pageSize, () => {
  page.value = 1;
});
watch(
  [page, pageSize],
  () => {
    void load();
  },
  { immediate: true }
);
</script>

<style scoped>
.row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.tag {
  margin-right: 6px;
  margin-bottom: 4px;
}
.muted {
  color: var(--app-text-muted);
  font-size: 13px;
}
.hint {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--app-text-hint);
  line-height: 1.5;
}
</style>
