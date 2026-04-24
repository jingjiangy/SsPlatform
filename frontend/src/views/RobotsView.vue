<template>
  <el-card>
    <template #header>
      <div class="row">
        <span>机器人管理</span>
        <el-button v-if="canWrite" type="primary" @click="openAdd">添加机器人</el-button>
      </div>
    </template>

    <el-table :data="items" border stripe row-key="_id">
      <el-table-column label="序号" width="72" align="center">
        <template #default="{ $index }">{{ revIdx($index) }}</template>
      </el-table-column>
      <el-table-column prop="_id" label="机器人ID" width="200" show-overflow-tooltip />
      <el-table-column prop="name" label="机器人名称" min-width="140" />
      <el-table-column prop="device_model" label="设备型号" width="120" />
      <el-table-column prop="status" label="机器人状态" width="100" />
      <el-table-column prop="version" label="机器人版本号" width="120" />
      <el-table-column label="创建时间" width="170">
        <template #default="{ row }">{{ formatDateTime(row.created_at) }}</template>
      </el-table-column>
      <el-table-column label="更新时间" width="170">
        <template #default="{ row }">{{ formatDateTime(row.updated_at) }}</template>
      </el-table-column>
      <el-table-column prop="created_by" label="创建人" width="100" show-overflow-tooltip />
      <el-table-column prop="updated_by" label="更新人" width="100" show-overflow-tooltip />
      <el-table-column label="机器人详情" width="100" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="openDetail(row)">详情</el-button>
        </template>
      </el-table-column>
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

    <el-dialog v-model="formDlg" :title="formDlgTitle" width="560px">
      <el-form :model="form" label-width="120px">
        <el-form-item label="机器人名称" required>
          <el-input v-model="form.name" />
        </el-form-item>
        <el-form-item label="设备型号" required>
          <el-select
            v-model="form.device_model_id"
            filterable
            clearable
            placeholder="请选择设备型号"
            style="width: 100%"
          >
            <el-option
              v-for="m in deviceModelOptions"
              :key="m.id"
              :label="m.status ? `${m.name}（${m.status}）` : m.name"
              :value="m.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="机器人状态" required>
          <el-select v-model="form.status" style="width: 100%">
            <el-option v-for="s in ROBOT_STATUS" :key="s" :label="s" :value="s" />
          </el-select>
        </el-form-item>
        <el-form-item label="机器人版本号" required>
          <el-input v-model="form.version" placeholder="如 1.0、2.0（一位小数）" />
        </el-form-item>
        <el-form-item label="机器人详情">
          <el-input v-model="form.details" type="textarea" :rows="4" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="formDlg = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveForm">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="detailDlg" title="机器人详情" width="560px">
      <el-form :model="detailForm" label-width="120px">
        <el-form-item label="机器人名称">
          <el-input v-model="detailForm.name" :disabled="!canWrite" />
        </el-form-item>
        <el-form-item label="设备型号">
          <el-select
            v-if="canWrite"
            v-model="detailForm.device_model_id"
            filterable
            clearable
            placeholder="请选择设备型号"
            style="width: 100%"
          >
            <el-option
              v-for="m in deviceModelOptions"
              :key="m.id"
              :label="m.status ? `${m.name}（${m.status}）` : m.name"
              :value="m.id"
            />
          </el-select>
          <el-input v-else :model-value="detailForm.device_model" readonly />
        </el-form-item>
        <el-form-item label="机器人状态">
          <el-select v-model="detailForm.status" style="width: 100%" :disabled="!canWrite">
            <el-option v-for="s in ROBOT_STATUS" :key="s" :label="s" :value="s" />
          </el-select>
        </el-form-item>
        <el-form-item label="机器人版本号">
          <el-input v-model="detailForm.version" :disabled="!canWrite" placeholder="如 1.0" />
        </el-form-item>
        <el-form-item label="机器人详情">
          <el-input v-model="detailForm.details" type="textarea" :rows="5" :disabled="!canWrite" />
        </el-form-item>
        <el-form-item label="创建时间">
          <el-input :model-value="formatDateTime(detailForm.created_at)" readonly />
        </el-form-item>
        <el-form-item label="更新时间">
          <el-input :model-value="formatDateTime(detailForm.updated_at)" readonly />
        </el-form-item>
        <el-form-item label="创建人">
          <el-input :model-value="detailForm.created_by || '—'" readonly />
        </el-form-item>
        <el-form-item label="更新人">
          <el-input :model-value="detailForm.updated_by || '—'" readonly />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="detailDlg = false">关闭</el-button>
        <el-button v-if="canWrite" type="primary" :loading="detailSaving" @click="saveDetail">保存</el-button>
      </template>
    </el-dialog>
  </el-card>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import http from "@/api/http";
import { ElMessage, ElMessageBox } from "element-plus";
import { ROBOT_STATUS } from "@/constants/options";
import { canWriteRobot } from "@/stores/auth";
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
const deviceModelOptions = ref<{ id: string; name: string; status: string }[]>([]);
const canWrite = computed(() => canWriteRobot());

const formDlg = ref(false);
const formMode = ref<"add" | "edit">("add");
const editingId = ref<string | null>(null);
const saving = ref(false);

const form = reactive({
  name: "",
  device_model_id: "",
  status: ROBOT_STATUS[0],
  version: "1.0",
  details: "",
});

const formDlgTitle = computed(() => (formMode.value === "add" ? "添加机器人" : "修改机器人"));

const detailDlg = ref(false);
const detailId = ref<string | null>(null);
const detailSaving = ref(false);
const detailForm = reactive({
  name: "",
  device_model: "",
  device_model_id: "",
  status: ROBOT_STATUS[0],
  version: "1.0",
  details: "",
  created_at: "",
  updated_at: "",
  created_by: "",
  updated_by: "",
});

async function loadDeviceModelOptions() {
  try {
    const { data } = await http.get("/api/robots/device-model-options");
    deviceModelOptions.value = (data.items || []) as {
      id: string;
      name: string;
      status: string;
    }[];
  } catch {
    deviceModelOptions.value = [];
  }
}

function resolveDeviceModelIdFromRow(row: Record<string, unknown>): string {
  const id = row.device_model_id != null ? String(row.device_model_id) : "";
  if (id) return id;
  const legacyName = String(row.device_model || "").trim();
  if (!legacyName) return "";
  const hit = deviceModelOptions.value.find((m) => m.name === legacyName);
  return hit ? hit.id : "";
}

async function load() {
  const { data } = await http.get("/api/robots", {
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
    device_model_id: "",
    status: ROBOT_STATUS[0],
    version: "1.0",
    details: "",
  });
  formDlg.value = true;
}

function openEdit(row: Record<string, unknown>) {
  formMode.value = "edit";
  editingId.value = String(row._id);
  form.name = String(row.name || "");
  form.device_model_id = resolveDeviceModelIdFromRow(row);
  form.status = String(row.status || ROBOT_STATUS[0]);
  form.version = String(row.version || "1.0");
  form.details = String(row.details || "");
  formDlg.value = true;
}

function openDetail(row: Record<string, unknown>) {
  detailId.value = String(row._id);
  detailForm.name = String(row.name || "");
  detailForm.device_model = String(row.device_model || "");
  detailForm.device_model_id = resolveDeviceModelIdFromRow(row);
  detailForm.status = String(row.status || ROBOT_STATUS[0]);
  detailForm.version = String(row.version || "1.0");
  detailForm.details = String(row.details || "");
  detailForm.created_at = String(row.created_at || "");
  detailForm.updated_at = String(row.updated_at || "");
  detailForm.created_by = String(row.created_by || "");
  detailForm.updated_by = String(row.updated_by || "");
  detailDlg.value = true;
}

async function saveForm() {
  if (!form.device_model_id?.trim()) {
    ElMessage.warning("请选择设备型号");
    return;
  }
  saving.value = true;
  try {
    if (formMode.value === "add") {
      await http.post("/api/robots", {
        name: form.name,
        device_model_id: form.device_model_id,
        status: form.status,
        version: form.version,
        details: form.details,
      });
    } else if (editingId.value) {
      await http.put(`/api/robots/${editingId.value}`, {
        name: form.name,
        device_model_id: form.device_model_id,
        status: form.status,
        version: form.version,
        details: form.details,
      });
    }
    formDlg.value = false;
    ElMessage.success("已保存");
    await load();
  } finally {
    saving.value = false;
  }
}

async function saveDetail() {
  if (!detailId.value || !canWrite.value) return;
  if (!detailForm.device_model_id?.trim()) {
    ElMessage.warning("请选择设备型号");
    return;
  }
  detailSaving.value = true;
  try {
    await http.put(`/api/robots/${detailId.value}`, {
      name: detailForm.name,
      device_model_id: detailForm.device_model_id,
      status: detailForm.status,
      version: detailForm.version,
      details: detailForm.details,
    });
    ElMessage.success("已保存");
    detailDlg.value = false;
    await load();
  } finally {
    detailSaving.value = false;
  }
}

async function remove(row: Record<string, unknown>) {
  await ElMessageBox.confirm(`确定删除机器人「${row.name}」？`, "删除", { type: "warning" });
  await http.delete(`/api/robots/${row._id}`);
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

onMounted(async () => {
  await loadDeviceModelOptions();
});
</script>

<style scoped>
.row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
</style>
