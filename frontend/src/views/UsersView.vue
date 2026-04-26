<template>
  <el-card>
    <template #header>
      <div class="row">
        <span>账号管理</span>
        <el-button type="primary" @click="openAdd">添加用户</el-button>
      </div>
    </template>
    <el-table :data="items" border stripe style="width: 100%" row-key="_id">
      <el-table-column label="序号" width="72" align="center">
        <template #default="{ $index }">{{ revIdx($index) }}</template>
      </el-table-column>
      <el-table-column prop="_id" label="用户ID" width="200" />
      <el-table-column prop="username" label="用户名" />
      <el-table-column label="角色">
        <template #default="{ row }">{{ roleDisplayName(String(row.role)) }}</template>
      </el-table-column>
      <el-table-column prop="phone" label="手机号" />
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

    <el-dialog v-model="dlg" :title="dlgTitle" width="520px" @closed="resetForm">
      <el-form :model="form" label-width="100px">
        <el-form-item label="用户名" required>
          <el-input v-model="form.username" :disabled="mode === 'edit'" />
        </el-form-item>
        <el-form-item label="密码" :required="mode === 'add'">
          <el-input v-model="form.password" type="password" show-password />
        </el-form-item>
        <el-form-item label="角色" required>
          <el-select v-model="form.role" style="width: 100%" filterable placeholder="选择角色">
            <el-option v-for="o in roleOptions" :key="o.value" :label="o.label" :value="o.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="手机号">
          <el-input v-model="form.phone" />
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
import { DEFAULT_PAGE_SIZE, reverseSerialIndex, skipForPage } from "@/utils/pagination";

const items = ref<Record<string, unknown>[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(DEFAULT_PAGE_SIZE);
const skip = computed(() => skipForPage(page.value, pageSize.value));

function revIdx($index: number) {
  return reverseSerialIndex(total.value, skip.value, $index);
}
const roleOptions = ref<{ label: string; value: string }[]>([]);

function roleDisplayName(code: string) {
  return roleOptions.value.find((o) => o.value === code)?.label ?? code;
}
const dlg = ref(false);
const mode = ref<"add" | "edit">("add");
const editingId = ref<string | null>(null);
const form = reactive({
  username: "",
  password: "",
  role: "evaluator",
  phone: "",
});

const dlgTitle = computed(() => (mode.value === "add" ? "添加用户" : "修改用户"));

async function load() {
  await loadRoleOptions();
  const { data } = await http.get("/api/users", {
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

async function loadRoleOptions() {
  const { data } = await http.get("/api/roles", { params: { skip: 0, limit: 200 } });
  roleOptions.value = (data.items as Record<string, unknown>[]).map((r) => ({
    value: String(r.code),
    label: String(r.name),
  }));
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
  form.username = String(row.username);
  form.password = "";
  form.role = String(row.role);
  form.phone = String(row.phone || "");
  dlg.value = true;
}

function resetForm() {
  form.username = "";
  form.password = "";
  form.role = "evaluator";
  form.phone = "";
}

async function save() {
  if (mode.value === "add") {
    await http.post("/api/users", {
      username: form.username,
      password: form.password,
      role: form.role,
      phone: form.phone,
    });
  } else if (editingId.value) {
    const body: Record<string, string> = {
      username: form.username,
      role: form.role,
      phone: form.phone,
    };
    if (form.password) body.password = form.password;
    await http.put(`/api/users/${editingId.value}`, body);
  }
  dlg.value = false;
  ElMessage.success("已保存");
  await load();
}

async function remove(row: Record<string, unknown>) {
  await ElMessageBox.confirm("确定删除该用户？", "删除", { type: "warning" });
  await http.delete(`/api/users/${row._id}`);
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
</style>
