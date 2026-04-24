<template>
  <el-card>
    <template #header>
      <div class="row">
        <div>
          <el-button link @click="$router.push('/materials')">← 返回</el-button>
          <span class="title">子版本列表（父素材 {{ parentId }}）</span>
        </div>
        <el-button v-if="canWrite" type="primary" @click="openAdd">添加版本</el-button>
      </div>
    </template>
    <el-table :data="items" border stripe row-key="_id">
      <el-table-column label="序号" width="72" align="center">
        <template #default="{ $index }">{{ revIdx($index) }}</template>
      </el-table-column>
      <el-table-column prop="_id" label="素材ID" width="200" show-overflow-tooltip />
      <el-table-column prop="name" label="名称" min-width="120" />
      <el-table-column prop="description" label="描述" show-overflow-tooltip min-width="160" />
      <el-table-column prop="version" label="版本" width="80" />
      <el-table-column prop="material_type" label="类型" width="110" />
      <el-table-column prop="status" label="状态" width="100" />
      <el-table-column label="机器人型号" width="120" show-overflow-tooltip>
        <template #default="{ row }">{{ row.robot_device_model || "—" }}</template>
      </el-table-column>
      <el-table-column label="视频" width="220">
        <template #default="{ row }">
          <video
            v-if="row.video_url"
            :src="resolveMediaUrl(String(row.video_url))"
            class="table-video"
            controls
            playsinline
            preload="metadata"
          />
          <span v-else>—</span>
        </template>
      </el-table-column>
      <el-table-column label="创建时间" width="180">
        <template #default="{ row }">{{ formatDateTime(row.created_at) }}</template>
      </el-table-column>
      <el-table-column label="更新时间" width="180">
        <template #default="{ row }">{{ formatDateTime(row.updated_at) }}</template>
      </el-table-column>
      <el-table-column label="关联评测" width="100">
        <template #default="{ row }">
          <el-button link type="primary" @click="goEval(row)">关联评测</el-button>
        </template>
      </el-table-column>
      <el-table-column v-if="canWrite" label="操作" width="160" fixed="right">
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

    <el-dialog v-model="dlg" title="添加子版本" width="640px">
      <el-form :model="form" label-width="140px">
        <el-form-item label="名称" required>
          <el-input v-model="form.name" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="form.description" type="textarea" :rows="4" />
        </el-form-item>
        <el-form-item label="类型" required>
          <el-select v-model="form.material_type" style="width: 100%">
            <el-option v-for="t in MATERIAL_TYPES" :key="t" :label="t" :value="t" />
          </el-select>
        </el-form-item>
        <el-form-item label="状态" required>
          <el-select v-model="form.status" style="width: 100%">
            <el-option v-for="s in MATERIAL_STATUS" :key="s" :label="s" :value="s" />
          </el-select>
        </el-form-item>
        <el-form-item label="机器人型号" required>
          <el-select
            v-model="form.device_model_id"
            filterable
            clearable
            placeholder="请选择机器人型号（来自设备型号库）"
            style="width: 100%"
          >
            <el-option
              v-for="m in deviceModelOptions"
              :key="m.id"
              :label="m.status ? `${m.name}（${m.status}）` : m.name"
              :value="m.id"
            />
          </el-select>
          <span class="muted">若列表为空，请先在「设备管理 → 设备型号」中维护</span>
        </el-form-item>
        <el-form-item label="版本号">
          <span class="muted">保存后由系统自动分配（自增）</span>
        </el-form-item>
        <el-form-item label="上传视频(mp4)">
          <el-upload :auto-upload="false" :show-file-list="false" accept="video/mp4" @change="onFile">
            <el-button>选择文件</el-button>
          </el-upload>
          <span v-if="fileLabel" class="muted">{{ fileLabel }}</span>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dlg = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveSub">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="editDlg" title="编辑子版本" width="640px">
      <el-form :model="editForm" label-width="140px">
        <el-form-item label="名称" required>
          <el-input v-model="editForm.name" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="editForm.description" type="textarea" :rows="4" />
        </el-form-item>
        <el-form-item label="类型" required>
          <el-select v-model="editForm.material_type" style="width: 100%">
            <el-option v-for="t in MATERIAL_TYPES" :key="t" :label="t" :value="t" />
          </el-select>
        </el-form-item>
        <el-form-item label="状态" required>
          <el-select v-model="editForm.status" style="width: 100%">
            <el-option v-for="s in MATERIAL_STATUS" :key="s" :label="s" :value="s" />
          </el-select>
        </el-form-item>
        <el-form-item label="机器人型号" required>
          <el-select
            v-model="editForm.device_model_id"
            filterable
            clearable
            placeholder="请选择机器人型号（来自设备型号库）"
            style="width: 100%"
          >
            <el-option
              v-for="m in deviceModelOptions"
              :key="m.id"
              :label="m.status ? `${m.name}（${m.status}）` : m.name"
              :value="m.id"
            />
          </el-select>
          <span class="muted">若列表为空，请先在「设备管理 → 设备型号」中维护</span>
        </el-form-item>
        <el-form-item label="版本号">
          <span class="muted">{{ editForm.version }}（不可修改）</span>
        </el-form-item>
        <el-form-item label="上传视频(mp4)">
          <el-upload :auto-upload="false" :show-file-list="false" accept="video/mp4" @change="onEditFile">
            <el-button>选择文件</el-button>
          </el-upload>
          <span v-if="editFileLabel" class="muted">{{ editFileLabel }}</span>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editDlg = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveEdit">保存</el-button>
      </template>
    </el-dialog>
  </el-card>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import http from "@/api/http";
import { ElMessage, ElMessageBox } from "element-plus";
import { MATERIAL_TYPES, MATERIAL_STATUS } from "@/constants/options";
import { canWriteMaterial } from "@/stores/auth";
import { resolveMediaUrl } from "@/utils/media";
import { formatDateTime } from "@/utils/datetime";
import { DEFAULT_PAGE_SIZE, reverseSerialIndex, skipForPage } from "@/utils/pagination";

const route = useRoute();
const router = useRouter();
const parentId = computed(() => String(route.params.parentId));

const items = ref<Record<string, unknown>[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(DEFAULT_PAGE_SIZE);
const skip = computed(() => skipForPage(page.value, pageSize.value));

function revIdx($index: number) {
  return reverseSerialIndex(total.value, skip.value, $index);
}
const deviceModelOptions = ref<{ id: string; name: string; status: string }[]>([]);
const dlg = ref(false);
const editDlg = ref(false);
const saving = ref(false);
const file = ref<File | null>(null);
const fileLabel = ref("");
const editFile = ref<File | null>(null);
const editFileLabel = ref("");
const editingId = ref<string | null>(null);

const canWrite = computed(() => canWriteMaterial());

const form = reactive({
  name: "",
  description: "",
  material_type: MATERIAL_TYPES[0],
  status: MATERIAL_STATUS[0],
  device_model_id: "",
});

const editForm = reactive({
  name: "",
  description: "",
  material_type: MATERIAL_TYPES[0],
  status: MATERIAL_STATUS[0],
  device_model_id: "",
  version: "",
});

async function loadDeviceModelOptions() {
  try {
    const { data } = await http.get("/api/materials/device-model-options");
    deviceModelOptions.value = (data.items || []) as { id: string; name: string; status: string }[];
  } catch {
    deviceModelOptions.value = [];
  }
}

function resolveDeviceModelIdFromRow(row: Record<string, unknown>): string {
  const id = row.device_model_id != null ? String(row.device_model_id) : "";
  if (id) return id;
  const legacyName = String(row.robot_device_model || "").trim();
  if (!legacyName) return "";
  const hit = deviceModelOptions.value.find((m) => m.name === legacyName);
  return hit ? hit.id : "";
}

async function load() {
  const { data } = await http.get("/api/materials", {
    params: { parent_id: parentId.value, skip: skip.value, limit: pageSize.value },
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

function goEval(row: Record<string, unknown>) {
  router.push({
    name: "eval-by-material",
    query: { materialId: String(row._id), materialName: String(row.name) },
  });
}

async function openAdd() {
  await loadDeviceModelOptions();
  Object.assign(form, {
    name: "",
    description: "",
    material_type: MATERIAL_TYPES[0],
    status: MATERIAL_STATUS[0],
    device_model_id: "",
  });
  file.value = null;
  fileLabel.value = "";
  dlg.value = true;
}

function onFile(uploadFile: { raw?: File }) {
  const f = uploadFile.raw;
  if (f) {
    file.value = f;
    fileLabel.value = f.name;
  }
}

function onEditFile(uploadFile: { raw?: File }) {
  const f = uploadFile.raw;
  if (f) {
    editFile.value = f;
    editFileLabel.value = f.name;
  }
}

async function saveSub() {
  if (!form.device_model_id?.trim()) {
    ElMessage.warning("请选择机器人型号");
    return;
  }
  saving.value = true;
  try {
    const { data } = await http.post(`/api/materials/${parentId.value}/sub-version`, {
      name: form.name,
      description: form.description,
      material_type: form.material_type,
      status: form.status,
      device_model_id: form.device_model_id.trim(),
    });
    if (file.value) {
      const fd = new FormData();
      fd.append("file", file.value);
      await http.post(`/api/materials/${data._id}/video`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
    }
    dlg.value = false;
    ElMessage.success("已添加子版本");
    await load();
  } finally {
    saving.value = false;
  }
}

async function openEdit(row: Record<string, unknown>) {
  await loadDeviceModelOptions();
  editingId.value = String(row._id);
  editForm.name = String(row.name);
  editForm.description = String(row.description || "");
  editForm.material_type = String(row.material_type);
  editForm.status = String(row.status);
  editForm.device_model_id = resolveDeviceModelIdFromRow(row);
  editForm.version = String(row.version);
  editFile.value = null;
  editFileLabel.value = "";
  editDlg.value = true;
}

async function saveEdit() {
  if (!editingId.value) return;
  if (!editForm.device_model_id?.trim()) {
    ElMessage.warning("请选择机器人型号");
    return;
  }
  saving.value = true;
  try {
    await http.put(`/api/materials/${editingId.value}`, {
      name: editForm.name,
      description: editForm.description,
      material_type: editForm.material_type,
      status: editForm.status,
      device_model_id: editForm.device_model_id.trim(),
    });
    if (editFile.value) {
      const fd = new FormData();
      fd.append("file", editFile.value);
      await http.post(`/api/materials/${editingId.value}/video`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
    }
    editDlg.value = false;
    ElMessage.success("已保存");
    await load();
  } finally {
    saving.value = false;
  }
}

async function remove(row: Record<string, unknown>) {
  await ElMessageBox.confirm("确定删除该子版本？", "删除", { type: "warning" });
  await http.delete(`/api/materials/${row._id}`);
  ElMessage.success("已删除");
  await load();
}

watch(
  () => parentId.value,
  () => {
    page.value = 1;
  }
);
watch(pageSize, () => {
  page.value = 1;
});
watch(
  [parentId, page, pageSize],
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
.title {
  margin-left: 8px;
  font-weight: 600;
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
.muted {
  margin-left: 8px;
  color: var(--app-text-muted);
  font-size: 12px;
}
</style>
