<template>
  <el-card>
    <template #header>
      <div class="row">
        <span>故障记录</span>
        <el-button v-if="canWrite" type="primary" @click="openAdd">添加故障记录</el-button>
      </div>
    </template>

    <div class="filter-row">
      <span class="filter-label">按机器人筛选</span>
      <el-select
        v-model="filterRobotId"
        clearable
        filterable
        placeholder="全部"
        style="width: 260px"
        @change="onRobotFilterChange"
        @clear="filterRobotId = ''"
      >
        <el-option label="全部" value="" />
        <el-option label="未关联机器人" value="__none__" />
        <el-option
          v-for="r in robotOptions"
          :key="r.id"
          :label="r.name || r.id"
          :value="r.id"
        />
      </el-select>
    </div>

    <el-table :data="items" border stripe row-key="_id">
      <el-table-column label="序号" width="72" align="center">
        <template #default="{ $index }">{{ revIdx($index) }}</template>
      </el-table-column>
      <el-table-column prop="_id" label="故障ID" width="200" show-overflow-tooltip />
      <el-table-column prop="name" label="故障名称" min-width="120" />
      <el-table-column prop="description" label="故障描述" min-width="120" show-overflow-tooltip />
      <el-table-column prop="status" label="故障状态" width="100" />
      <el-table-column prop="robot_name" label="关联机器人" width="120" show-overflow-tooltip>
        <template #default="{ row }">{{ row.robot_name || "—" }}</template>
      </el-table-column>
      <el-table-column label="创建时间" width="170">
        <template #default="{ row }">{{ formatDateTime(row.created_at) }}</template>
      </el-table-column>
      <el-table-column label="更新时间" width="170">
        <template #default="{ row }">{{ formatDateTime(row.updated_at) }}</template>
      </el-table-column>
      <el-table-column prop="created_by" label="创建人" width="100" show-overflow-tooltip />
      <el-table-column prop="maintainer" label="维修人" width="100" show-overflow-tooltip />
      <el-table-column label="故障图片" width="100" align="center">
        <template #default="{ row }">
          <el-image
            v-if="row.image_url"
            :src="imgUrl(String(row.image_url))"
            fit="cover"
            class="thumb"
            preview-teleported
            :preview-src-list="[imgUrl(String(row.image_url))]"
          />
          <span v-else class="muted">—</span>
        </template>
      </el-table-column>
      <el-table-column label="故障详情" width="100" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="openDetail(row)">查看</el-button>
        </template>
      </el-table-column>
      <el-table-column v-if="canWrite" label="操作" width="160" fixed="right">
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

    <el-dialog v-model="formDlg" :title="formDlgTitle" width="560px" @closed="onFormClosed">
      <el-form :model="form" label-width="100px">
        <el-form-item label="故障名称" required>
          <el-input v-model="form.name" />
        </el-form-item>
        <el-form-item label="故障描述">
          <el-input v-model="form.description" type="textarea" :rows="4" />
        </el-form-item>
        <el-form-item label="故障状态" required>
          <el-select v-model="form.status" style="width: 100%">
            <el-option v-for="s in FAULT_STATUS" :key="s" :label="s" :value="s" />
          </el-select>
        </el-form-item>
        <el-form-item label="关联机器人">
          <el-select
            v-model="form.robot_id"
            filterable
            clearable
            placeholder="不关联"
            style="width: 100%"
          >
            <el-option
              v-for="r in robotOptions"
              :key="r.id"
              :label="r.name || r.id"
              :value="r.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="维修人">
          <el-input v-model="form.maintainer" placeholder="可选" clearable />
        </el-form-item>
        <el-form-item label="故障图片">
          <el-upload
            :auto-upload="false"
            :show-file-list="false"
            accept=".jpg,.jpeg,.png,image/jpeg,image/png"
            :disabled="!canWrite"
            @change="onImagePick"
          >
            <el-button :disabled="!canWrite">选择图片</el-button>
          </el-upload>
          <span v-if="imagePickLabel" class="muted">{{ imagePickLabel }}</span>
          <div v-if="form.image_url" class="preview-row">
            <el-image :src="imgUrl(form.image_url)" fit="cover" class="thumb" />
            <el-button v-if="canWrite" link type="danger" @click="clearFormImage">移除</el-button>
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="formDlg = false">取消</el-button>
        <el-button v-if="canWrite" type="primary" :loading="saving" @click="saveForm">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="detailDlg" title="故障详情" width="640px" @opened="onDetailOpened">
      <el-descriptions :column="2" border>
        <el-descriptions-item label="故障名称">{{ detail.name }}</el-descriptions-item>
        <el-descriptions-item label="故障状态">{{ detail.status }}</el-descriptions-item>
        <el-descriptions-item label="关联机器人">{{ detail.robot_name || "—" }}</el-descriptions-item>
        <el-descriptions-item label="维修人">{{ detail.maintainer || "—" }}</el-descriptions-item>
        <el-descriptions-item label="创建时间">{{ detail.created_at }}</el-descriptions-item>
        <el-descriptions-item label="更新时间">{{ detail.updated_at }}</el-descriptions-item>
        <el-descriptions-item label="创建人">{{ detail.created_by || "—" }}</el-descriptions-item>
        <el-descriptions-item label="更新人">{{ detail.updated_by || "—" }}</el-descriptions-item>
        <el-descriptions-item label="故障描述" :span="2">
          <div class="detail-text">{{ detail.description || "—" }}</div>
        </el-descriptions-item>
        <el-descriptions-item v-if="detail.image_url" label="故障图片" :span="2">
          <el-image :src="imgUrl(detail.image_url)" fit="contain" class="detail-img" />
        </el-descriptions-item>
      </el-descriptions>
    </el-dialog>
  </el-card>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import http from "@/api/http";
import { ElMessage, ElMessageBox } from "element-plus";
import { FAULT_STATUS } from "@/constants/options";
import { canWriteFaultRecord } from "@/stores/auth";
import { formatDateTime } from "@/utils/datetime";
import { resolveMediaUrl } from "@/utils/media";
import { DEFAULT_PAGE_SIZE, reverseSerialIndex, skipForPage } from "@/utils/pagination";

const items = ref<Record<string, unknown>[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(DEFAULT_PAGE_SIZE);
const skip = computed(() => skipForPage(page.value, pageSize.value));
const filterRobotId = ref("");

function revIdx($index: number) {
  return reverseSerialIndex(total.value, skip.value, $index);
}
const canWrite = computed(() => canWriteFaultRecord());

function imgUrl(url: string) {
  return resolveMediaUrl(url);
}

const robotOptions = ref<{ id: string; name: string }[]>([]);

function onRobotFilterChange() {
  page.value = 1;
}

async function loadRobotOptions() {
  try {
    const { data } = await http.get("/api/fault-records/robot-options");
    robotOptions.value = (data.items || []) as { id: string; name: string }[];
  } catch {
    robotOptions.value = [];
  }
}

async function load() {
  const params: Record<string, string | number> = {
    skip: skip.value,
    limit: pageSize.value,
  };
  const ridRaw = filterRobotId.value;
  const rid = ridRaw == null ? "" : String(ridRaw).trim();
  if (rid) params.robot_id = rid;
  const { data } = await http.get("/api/fault-records", { params });
  const list = (data.items || []) as Record<string, unknown>[];
  const t = Number((data as { total?: number }).total);
  if (list.length === 0 && t > 0 && page.value > 1) {
    page.value = 1;
    return load();
  }
  items.value = list;
  total.value = Number.isFinite(t) ? t : 0;
}

const formDlg = ref(false);
const formMode = ref<"add" | "edit">("add");
const editingId = ref<string | null>(null);
const saving = ref(false);
const imagePickLabel = ref("");
const pendingImageFile = ref<File | null>(null);

const form = reactive({
  name: "",
  description: "",
  status: FAULT_STATUS[0],
  robot_id: "" as string,
  maintainer: "",
  image_url: "",
});

const formDlgTitle = computed(() =>
  formMode.value === "add" ? "添加故障记录" : "修改故障记录"
);

const detailDlg = ref(false);
const detailId = ref<string | null>(null);
const detail = reactive({
  name: "",
  description: "",
  status: "",
  robot_name: "",
  maintainer: "",
  created_at: "",
  updated_at: "",
  created_by: "",
  updated_by: "",
  image_url: "",
});

function onFormClosed() {
  imagePickLabel.value = "";
  pendingImageFile.value = null;
}

function onImagePick(uploadFile: { raw?: File }) {
  const f = uploadFile.raw;
  if (!f) return;
  const lower = f.name.toLowerCase();
  if (!lower.endsWith(".jpg") && !lower.endsWith(".jpeg") && !lower.endsWith(".png")) {
    ElMessage.warning("仅支持 jpg、png、jpeg 格式");
    return;
  }
  pendingImageFile.value = f;
  imagePickLabel.value = f.name;
}

function clearFormImage() {
  form.image_url = "";
  pendingImageFile.value = null;
  imagePickLabel.value = "";
}

async function uploadPendingImage(): Promise<boolean> {
  const f = pendingImageFile.value;
  if (!f) return true;
  const fd = new FormData();
  fd.append("file", f);
  try {
    const { data } = await http.post("/api/fault-records/upload-image", fd, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    form.image_url = String(data.image_url || "");
    pendingImageFile.value = null;
    imagePickLabel.value = "";
    return true;
  } catch {
    return false;
  }
}

async function openAdd() {
  formMode.value = "add";
  editingId.value = null;
  imagePickLabel.value = "";
  pendingImageFile.value = null;
  await loadRobotOptions();
  Object.assign(form, {
    name: "",
    description: "",
    status: FAULT_STATUS[0],
    robot_id: "",
    maintainer: "",
    image_url: "",
  });
  formDlg.value = true;
}

async function openEdit(row: Record<string, unknown>) {
  formMode.value = "edit";
  editingId.value = String(row._id);
  imagePickLabel.value = "";
  pendingImageFile.value = null;
  await loadRobotOptions();
  const { data } = await http.get(`/api/fault-records/${editingId.value}`);
  form.name = String(data.name || "");
  form.description = String(data.description || "");
  form.status = String(data.status || FAULT_STATUS[0]);
  form.robot_id = data.robot_id != null ? String(data.robot_id) : "";
  form.maintainer = String(data.maintainer || "");
  form.image_url = String(data.image_url || "");
  formDlg.value = true;
}

async function saveForm() {
  saving.value = true;
  try {
    if (!(await uploadPendingImage())) return;
    const robot_id = form.robot_id?.trim() || "";
    if (formMode.value === "add") {
      await http.post("/api/fault-records", {
        name: form.name,
        description: form.description,
        status: form.status,
        robot_id,
        maintainer: form.maintainer,
        image_url: form.image_url,
      });
    } else if (editingId.value) {
      await http.put(`/api/fault-records/${editingId.value}`, {
        name: form.name,
        description: form.description,
        status: form.status,
        robot_id,
        maintainer: form.maintainer,
        image_url: form.image_url,
      });
    }
    formDlg.value = false;
    ElMessage.success("已保存");
    await load();
  } finally {
    saving.value = false;
  }
}

async function openDetail(row: Record<string, unknown>) {
  detailId.value = String(row._id);
  detailDlg.value = true;
}

async function onDetailOpened() {
  const id = detailId.value;
  if (!id) return;
  try {
    const { data } = await http.get(`/api/fault-records/${id}`);
    detail.name = String(data.name || "");
    detail.description = String(data.description || "");
    detail.status = String(data.status || "");
    detail.robot_name = String(data.robot_name || "");
    detail.maintainer = String(data.maintainer || "");
    detail.created_at = formatDateTime(data.created_at);
    detail.updated_at = formatDateTime(data.updated_at);
    detail.created_by = String(data.created_by || "");
    detail.updated_by = String(data.updated_by || "");
    detail.image_url = String(data.image_url || "");
  } catch {
    Object.assign(detail, {
      name: "",
      description: "",
      status: "",
      robot_name: "",
      maintainer: "",
      created_at: "",
      updated_at: "",
      created_by: "",
      updated_by: "",
      image_url: "",
    });
  }
}

async function remove(row: Record<string, unknown>) {
  await ElMessageBox.confirm(`确定删除故障记录「${row.name}」？`, "删除", { type: "warning" });
  await http.delete(`/api/fault-records/${row._id}`);
  ElMessage.success("已删除");
  await load();
}

watch(pageSize, () => {
  page.value = 1;
});
watch(
  [page, pageSize, filterRobotId],
  () => {
    void load();
  },
  { immediate: true }
);

onMounted(() => {
  void loadRobotOptions();
});
</script>

<style scoped>
.row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.filter-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}
.filter-label {
  font-size: 14px;
  color: var(--el-text-color-regular);
  white-space: nowrap;
}
.thumb {
  width: 48px;
  height: 48px;
  border-radius: 4px;
}
.preview-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
}
.muted {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  margin-left: 8px;
}
.detail-text {
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.5;
}
.detail-img {
  max-width: 100%;
  max-height: 280px;
}
</style>
