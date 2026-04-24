<template>
  <el-card>
    <template #header>
      <div class="row">
        <span>设备型号</span>
        <el-button v-if="canWrite" type="primary" @click="openAdd">添加设备型号</el-button>
      </div>
    </template>

    <el-table :data="items" border stripe row-key="_id">
      <el-table-column label="序号" width="72" align="center">
        <template #default="{ $index }">{{ revIdx($index) }}</template>
      </el-table-column>
      <el-table-column prop="_id" label="设备型号ID" width="200" show-overflow-tooltip />
      <el-table-column prop="name" label="设备型号名称" min-width="140" />
      <el-table-column prop="description" label="设备型号描述" min-width="160" show-overflow-tooltip />
      <el-table-column prop="status" label="设备型号状态" width="110" />
      <el-table-column label="创建时间" width="170">
        <template #default="{ row }">{{ formatDateTime(row.created_at) }}</template>
      </el-table-column>
      <el-table-column label="更新时间" width="170">
        <template #default="{ row }">{{ formatDateTime(row.updated_at) }}</template>
      </el-table-column>
      <el-table-column prop="created_by" label="创建人" width="100" show-overflow-tooltip />
      <el-table-column prop="updated_by" label="更新人" width="100" show-overflow-tooltip />
      <el-table-column v-if="canWrite" label="操作" width="140" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
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

    <el-dialog v-model="formDlg" :title="formDlgTitle" width="520px">
      <el-form :model="form" label-width="120px">
        <el-form-item label="设备型号名称" required>
          <el-input v-model="form.name" />
        </el-form-item>
        <el-form-item label="设备型号描述">
          <el-input v-model="form.description" type="textarea" :rows="3" />
        </el-form-item>
        <el-form-item label="设备型号状态" required>
          <el-select v-model="form.status" style="width: 100%">
            <el-option v-for="s in DEVICE_MODEL_STATUS" :key="s" :label="s" :value="s" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="formDlg = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveForm">保存</el-button>
      </template>
    </el-dialog>
  </el-card>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import http from "@/api/http";
import { ElMessage, ElMessageBox } from "element-plus";
import { DEVICE_MODEL_STATUS } from "@/constants/options";
import { canWriteDeviceModel } from "@/stores/auth";
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
const canWrite = computed(() => canWriteDeviceModel());

const formDlg = ref(false);
const formMode = ref<"add" | "edit">("add");
const editingId = ref<string | null>(null);
const saving = ref(false);

const form = reactive({
  name: "",
  description: "",
  status: DEVICE_MODEL_STATUS[0],
});

const formDlgTitle = computed(() => (formMode.value === "add" ? "添加设备型号" : "修改设备型号"));

async function load() {
  const { data } = await http.get("/api/device-models", {
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
  formMode.value = "add";
  editingId.value = null;
  Object.assign(form, {
    name: "",
    description: "",
    status: DEVICE_MODEL_STATUS[0],
  });
  formDlg.value = true;
}

function openEdit(row: Record<string, unknown>) {
  formMode.value = "edit";
  editingId.value = String(row._id);
  form.name = String(row.name || "");
  form.description = String(row.description || "");
  form.status = String(row.status || DEVICE_MODEL_STATUS[0]);
  formDlg.value = true;
}

async function saveForm() {
  saving.value = true;
  try {
    if (formMode.value === "add") {
      await http.post("/api/device-models", {
        name: form.name,
        description: form.description,
        status: form.status,
      });
    } else if (editingId.value) {
      await http.put(`/api/device-models/${editingId.value}`, {
        name: form.name,
        description: form.description,
        status: form.status,
      });
    }
    formDlg.value = false;
    ElMessage.success("已保存");
    await load();
  } finally {
    saving.value = false;
  }
}

async function remove(row: Record<string, unknown>) {
  await ElMessageBox.confirm(`确定删除设备型号「${row.name}」？`, "删除", { type: "warning" });
  await http.delete(`/api/device-models/${row._id}`);
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
