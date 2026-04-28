<template>
  <el-card class="materials-page">
    <template #header>
      <div class="row">
        <span>世界模型素材库（父级列表）</span>
        <el-button v-if="canWrite" type="primary" @click="openAdd">添加素材</el-button>
      </div>
    </template>
    <el-table
      ref="matTableRef"
      :key="tableKey"
      :data="items"
      row-key="_id"
      border
      stripe
      lazy
      :load="loadChildRows"
      :tree-props="{ children: 'children', hasChildren: 'hasChildren' }"
    >
      <el-table-column label="序号" width="72" align="center">
        <template #default="{ $index }">{{ revIdx($index) }}</template>
      </el-table-column>
      <el-table-column prop="_id" label="素材ID" width="200" show-overflow-tooltip />
      <el-table-column label="名称" min-width="200">
        <template #default="{ row }">
          <div class="name-cell">
            <el-button link type="primary" class="name-link" @click="goVersions(row)">{{ row.name }}</el-button>
            <el-tag v-if="!row.parent_id" type="info" size="small" effect="plain">
              {{ Number(row.child_count ?? 0) + 1 }} 个版本
            </el-tag>
          </div>
        </template>
      </el-table-column>
      <el-table-column prop="description" label="描述" show-overflow-tooltip min-width="160" />
      <el-table-column prop="material_type" label="类型" width="110" />
      <el-table-column prop="status" label="状态" width="100" />
      <el-table-column label="机器人型号" width="120" show-overflow-tooltip>
        <template #default="{ row }">{{ row.robot_device_model || "—" }}</template>
      </el-table-column>
      <el-table-column prop="version" width="96">
        <template #header>
          <el-tooltip
            placement="top"
            content="父行：父素材自身版本号，新增子版本不会自动改这里。子行：该子素材的版本号（保存子版本时由系统递增）。"
          >
            <span class="th-tip">版本号</span>
          </el-tooltip>
        </template>
      </el-table-column>
      <el-table-column label="视频" width="120">
        <template #default="{ row }">
          <el-button
            v-if="row.video_url"
            link
            type="primary"
            @click="openVideoPreview(row)"
          >
            预览视频
          </el-button>
          <span v-else>—</span>
        </template>
      </el-table-column>
      <el-table-column label="创建时间" width="180">
        <template #default="{ row }">{{ formatDateTime(row.created_at) }}</template>
      </el-table-column>
      <el-table-column label="更新时间" width="180">
        <template #default="{ row }">{{ formatDateTime(row.updated_at) }}</template>
      </el-table-column>
      <el-table-column label="关联评测" width="100" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="goEval(row)">关联评测</el-button>
        </template>
      </el-table-column>
      <el-table-column v-if="canWrite" label="操作" width="200" fixed="right">
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

    <el-dialog v-model="dlg" :title="dlgTitle" width="640px" @closed="resetForm">
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
        <el-form-item v-if="mode === 'add' || mode === 'edit'" label="上传视频(mp4)">
          <el-upload
            :auto-upload="false"
            :show-file-list="false"
            accept="video/mp4"
            @change="onFile"
          >
            <el-button>选择文件</el-button>
          </el-upload>
          <span v-if="fileLabel" class="muted">{{ fileLabel }}</span>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dlg = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="videoPreviewOpen"
      title="视频预览"
      width="min(720px, 92vw)"
      destroy-on-close
      @closed="videoPreviewUrl = ''"
    >
      <video
        v-if="videoPreviewUrl"
        :key="videoPreviewUrl"
        :src="videoPreviewUrl"
        class="preview-video"
        controls
        playsinline
        preload="metadata"
      />
    </el-dialog>
  </el-card>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref, computed, watch, nextTick } from "vue";
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
const matTableRef = ref<{ toggleRowExpansion: (row: Record<string, unknown>, expanded?: boolean) => void } | null>(
  null
);
const items = ref<Record<string, unknown>[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(DEFAULT_PAGE_SIZE);
const skip = computed(() => skipForPage(page.value, pageSize.value));

function revIdx($index: number) {
  return reverseSerialIndex(total.value, skip.value, $index);
}
/** 父级数据刷新后递增，重置树形表格内部缓存，避免子节点与新的父列表不一致 */
const tableKey = ref(0);
const materialsLoadedOnce = ref(false);
const deviceModelOptions = ref<{ id: string; name: string; status: string }[]>([]);
const dlg = ref(false);
const mode = ref<"add" | "edit">("add");
const editingId = ref<string | null>(null);
const saving = ref(false);
const file = ref<File | null>(null);
const fileLabel = ref("");
const videoPreviewOpen = ref(false);
const videoPreviewUrl = ref("");

const canWrite = computed(() => canWriteMaterial());

function openVideoPreview(row: Record<string, unknown>) {
  const u = row.video_url;
  if (!u) return;
  videoPreviewUrl.value = resolveMediaUrl(String(u));
  videoPreviewOpen.value = true;
}

const form = reactive({
  name: "",
  description: "",
  material_type: MATERIAL_TYPES[0],
  status: MATERIAL_STATUS[0],
  device_model_id: "",
});

const dlgTitle = computed(() => (mode.value === "add" ? "添加世界模型素材" : "编辑世界模型素材"));

async function loadDeviceModelOptions() {
  try {
    const { data } = await http.get("/api/materials/device-model-options");
    deviceModelOptions.value = (data.items || []) as { id: string; name: string; status: string }[];
  } catch {
    deviceModelOptions.value = [];
  }
}

/** 旧数据仅有 robot_device_model 文本时，按名称匹配设备型号 id */
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
    params: { skip: skip.value, limit: pageSize.value },
  });
  const list = (data.items || []) as Record<string, unknown>[];
  const t = Number((data as { total?: number }).total);
  if (list.length === 0 && t > 0 && page.value > 1) {
    page.value = 1;
    return load();
  }
  items.value = list.map((row) => ({
    ...row,
    hasChildren: Number(row.child_count ?? 0) > 0,
  }));
  total.value = Number.isFinite(t) ? t : 0;
  if (materialsLoadedOnce.value) tableKey.value += 1;
  materialsLoadedOnce.value = true;
  await applyExpandMaterialFromQuery();
}

async function applyExpandMaterialFromQuery() {
  const raw = route.query.expandMaterial;
  const id =
    typeof raw === "string" ? raw : Array.isArray(raw) ? String(raw[0] || "") : "";
  if (!id) return;
  await nextTick();
  const row = items.value.find((r) => String(r._id) === id);
  const table = matTableRef.value;
  if (row && table) {
    if (row.hasChildren) {
      table.toggleRowExpansion(row, true);
    }
    await nextTick();
    const tr = document.querySelector(`.materials-page tr[data-row-key="${id}"]`);
    tr?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }
  if (route.query.expandMaterial) {
    await router.replace({ name: "materials", query: {} });
  }
}

async function loadChildRows(
  row: Record<string, unknown>,
  _treeNode: unknown,
  resolve: (data: Record<string, unknown>[]) => void
) {
  const id = String(row._id);
  if (Number(row.child_count ?? 0) === 0) {
    resolve([]);
    return;
  }
  try {
    const { data } = await http.get("/api/materials", {
      params: { parent_id: id, skip: 0, limit: 200 },
    });
    const childRows = (data.items as Record<string, unknown>[]).map((c) => ({
      ...c,
      hasChildren: false,
    }));
    resolve(childRows);
  } catch {
    resolve([]);
  }
}

/** 子行进入的是父素材的版本管理页 */
function goVersions(row: Record<string, unknown>) {
  const parentId = row.parent_id ? String(row.parent_id) : String(row._id);
  router.push({ name: "material-versions", params: { parentId } });
}

function goEval(row: Record<string, unknown>) {
  router.push({
    name: "eval-by-material",
    query: { materialId: String(row._id), materialName: String(row.name) },
  });
}

async function openAdd() {
  mode.value = "add";
  editingId.value = null;
  file.value = null;
  fileLabel.value = "";
  await loadDeviceModelOptions();
  Object.assign(form, {
    name: "",
    description: "",
    material_type: MATERIAL_TYPES[0],
    status: MATERIAL_STATUS[0],
    device_model_id: "",
  });
  dlg.value = true;
}

async function openEdit(row: Record<string, unknown>) {
  mode.value = "edit";
  editingId.value = String(row._id);
  await loadDeviceModelOptions();
  form.name = String(row.name);
  form.description = String(row.description || "");
  form.material_type = String(row.material_type);
  form.status = String(row.status);
  form.device_model_id = resolveDeviceModelIdFromRow(row);
  file.value = null;
  fileLabel.value = "";
  dlg.value = true;
}

function resetForm() {
  file.value = null;
  fileLabel.value = "";
}

function onFile(uploadFile: { raw?: File }) {
  const f = uploadFile.raw;
  if (f) {
    file.value = f;
    fileLabel.value = f.name;
  }
}

async function save() {
  if (!form.device_model_id?.trim()) {
    ElMessage.warning("请选择机器人型号");
    return;
  }
  saving.value = true;
  try {
    if (mode.value === "add") {
      const { data } = await http.post("/api/materials", {
        name: form.name,
        description: form.description,
        material_type: form.material_type,
        status: form.status,
        version: "1.0",
        device_model_id: form.device_model_id.trim(),
        parent_id: null,
      });
      if (file.value) {
        const fd = new FormData();
        fd.append("file", file.value);
        await http.post(`/api/materials/${data._id}/video`, fd, {
          headers: { "Content-Type": "multipart/form-data" },
        });
      }
    } else if (editingId.value) {
      await http.put(`/api/materials/${editingId.value}`, {
        name: form.name,
        description: form.description,
        material_type: form.material_type,
        status: form.status,
        device_model_id: form.device_model_id.trim(),
      });
      if (file.value) {
        const fd = new FormData();
        fd.append("file", file.value);
        await http.post(`/api/materials/${editingId.value}/video`, fd, {
          headers: { "Content-Type": "multipart/form-data" },
        });
      }
    }
    dlg.value = false;
    ElMessage.success("已保存");
    await load();
  } finally {
    saving.value = false;
  }
}

async function remove(row: Record<string, unknown>) {
  const isChild = !!row.parent_id;
  await ElMessageBox.confirm(
    isChild ? "确定删除该子版本？" : "将同时删除子版本，确定？",
    "删除",
    { type: "warning" }
  );
  await http.delete(`/api/materials/${row._id}`);
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

watch(
  () => route.query.expandMaterial,
  async (v) => {
    const id = typeof v === "string" ? v : Array.isArray(v) ? String(v[0] || "") : "";
    if (!id) return;
    if (!items.value.length) await load();
    else await applyExpandMaterialFromQuery();
  }
);
</script>

<style scoped>
.row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.preview-video {
  display: block;
  width: 100%;
  max-height: min(70vh, 520px);
  border-radius: 4px;
  background: #000;
  object-fit: contain;
}
.name-cell {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.name-link {
  padding: 0;
  height: auto;
}
.muted {
  margin-left: 8px;
  color: var(--app-text-muted);
  font-size: 12px;
}
.th-tip {
  cursor: help;
  text-decoration: underline dotted;
  text-underline-offset: 3px;
}
</style>
