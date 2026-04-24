<template>
  <el-card>
    <template #header>
      <div class="row">
        <span>配件管理</span>
        <el-button v-if="canWrite" type="primary" @click="openAdd">添加配件</el-button>
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
      <el-table-column prop="_id" label="配件ID" width="200" show-overflow-tooltip />
      <el-table-column prop="name" label="配件名称" min-width="120" />
      <el-table-column prop="description" label="配件描述" min-width="120" show-overflow-tooltip />
      <el-table-column prop="remark" label="配件备注" min-width="120" show-overflow-tooltip />
      <el-table-column prop="status" label="配件状态" width="100" />
      <el-table-column prop="quantity" label="配件数量" width="100" align="right" />
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
      <el-table-column prop="updated_by" label="更新人" width="100" show-overflow-tooltip />
      <el-table-column label="配件图片" width="100" align="center">
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
      <el-table-column label="配件历史记录" width="120" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="openDetail(row)">查看</el-button>
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

    <el-dialog v-model="formDlg" :title="formDlgTitle" width="560px" @closed="onFormClosed">
      <el-form :model="form" label-width="120px">
        <el-form-item label="配件名称" required>
          <el-input v-model="form.name" />
        </el-form-item>
        <el-form-item label="配件描述">
          <el-input v-model="form.description" type="textarea" :rows="4" />
        </el-form-item>
        <el-form-item label="配件备注">
          <el-input
            v-model="form.remark"
            type="textarea"
            :rows="3"
            placeholder="用于配件历史记录展示；保存后与历史同步"
          />
        </el-form-item>
        <el-form-item label="配件状态" required>
          <el-select v-model="form.status" style="width: 100%">
            <el-option v-for="s in PART_STATUS" :key="s" :label="s" :value="s" />
          </el-select>
        </el-form-item>
        <el-form-item label="配件数量" required>
          <el-input v-model="form.quantity" inputmode="numeric" placeholder="非负整数" />
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
        <template v-if="formMode === 'edit'">
          <el-form-item label="创建时间">
            <el-input :model-value="formatDateTime(form.created_at)" disabled />
          </el-form-item>
          <el-form-item label="更新时间">
            <el-input :model-value="formatDateTime(form.updated_at)" disabled />
          </el-form-item>
          <el-form-item label="执行人">
            <el-input v-model="form.executor" placeholder="请输入本次操作执行人" clearable />
          </el-form-item>
        </template>
        <el-form-item label="配件图片">
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

    <el-dialog v-model="detailDlg" title="配件历史记录" width="760px" @opened="onDetailOpened">
      <el-descriptions :column="2" border class="detail-head">
        <el-descriptions-item label="配件名称">{{ detailPartName }}</el-descriptions-item>
        <el-descriptions-item label="配件状态">{{ detailPartStatus }}</el-descriptions-item>
        <el-descriptions-item label="当前数量">{{ detailPartQuantity }}</el-descriptions-item>
        <el-descriptions-item label="配件备注" :span="2">
          <div class="detail-remark">{{ detailPartRemark || "—" }}</div>
        </el-descriptions-item>
      </el-descriptions>
      <el-tabs v-model="detailTab" class="detail-tabs">
        <el-tab-pane label="历史出入库记录" name="inbound">
          <el-table :data="detailInbound" border stripe max-height="360">
            <el-table-column label="时间" width="170">
              <template #default="{ row }">{{ formatDateTime(row.at) }}</template>
            </el-table-column>
            <el-table-column label="执行人" width="120" show-overflow-tooltip>
              <template #default="{ row }">{{ historyExecutor(row) }}</template>
            </el-table-column>
            <el-table-column label="类型" width="88" align="center">
              <template #default="{ row }">{{ inboundKindLabel(row) }}</template>
            </el-table-column>
            <el-table-column prop="quantity" label="数量" width="100" align="right" />
            <el-table-column prop="note" label="备注" min-width="120" show-overflow-tooltip />
          </el-table>
        </el-tab-pane>
        <el-tab-pane label="历史更新记录" name="updates">
          <el-table :data="detailUpdates" border stripe max-height="360">
            <el-table-column label="更新时间" width="170">
              <template #default="{ row }">{{ formatDateTime(row.at) }}</template>
            </el-table-column>
            <el-table-column label="执行人" width="120" show-overflow-tooltip>
              <template #default="{ row }">{{ historyExecutor(row) }}</template>
            </el-table-column>
            <el-table-column prop="quantity" label="更新后数量" width="110" align="right" />
            <el-table-column label="更新后状态" width="100">
              <template #default="{ row }">{{ row.status || "—" }}</template>
            </el-table-column>
            <el-table-column label="更新后备注" min-width="120" show-overflow-tooltip>
              <template #default="{ row }">{{ row.remark || "—" }}</template>
            </el-table-column>
          </el-table>
        </el-tab-pane>
      </el-tabs>
    </el-dialog>
  </el-card>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import http from "@/api/http";
import { ElMessage, ElMessageBox } from "element-plus";
import { PART_STATUS } from "@/constants/options";
import { canWritePart, useAuthStore } from "@/stores/auth";
import { formatDateTime } from "@/utils/datetime";
import { resolveMediaUrl } from "@/utils/media";
import { DEFAULT_PAGE_SIZE, reverseSerialIndex, skipForPage } from "@/utils/pagination";

type InboundRow = {
  at: string;
  by?: string;
  executor?: string;
  quantity: number;
  note?: string;
  kind?: string;
};
type UpdateRow = {
  at: string;
  by?: string;
  executor?: string;
  quantity: number;
  status?: string;
  remark?: string;
};

const items = ref<Record<string, unknown>[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(DEFAULT_PAGE_SIZE);
const skip = computed(() => skipForPage(page.value, pageSize.value));

function revIdx($index: number) {
  return reverseSerialIndex(total.value, skip.value, $index);
}
const canWrite = computed(() => canWritePart());

function imgUrl(url: string) {
  return resolveMediaUrl(url);
}

const robotOptions = ref<{ id: string; name: string }[]>([]);
const filterRobotId = ref("");

function onRobotFilterChange() {
  page.value = 1;
}

async function loadRobotOptions() {
  try {
    const { data } = await http.get("/api/parts/robot-options");
    robotOptions.value = (data.items || []) as { id: string; name: string }[];
  } catch {
    robotOptions.value = [];
  }
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
  remark: "",
  status: PART_STATUS[0],
  quantity: "0",
  robot_id: "" as string,
  image_url: "",
  created_at: "",
  updated_at: "",
  executor: "",
});

const formDlgTitle = computed(() => (formMode.value === "add" ? "添加配件" : "修改配件"));

const detailDlg = ref(false);
const detailTab = ref<"inbound" | "updates">("inbound");
const detailId = ref<string | null>(null);
const detailPartName = ref("");
const detailPartStatus = ref("");
const detailPartQuantity = ref("");
const detailPartRemark = ref("");
const detailInbound = ref<InboundRow[]>([]);
const detailUpdates = ref<UpdateRow[]>([]);

function inboundKindLabel(row: InboundRow) {
  const k = String(row.kind || "").toLowerCase();
  if (k === "out") return "出库";
  const n = String(row.note || "");
  if (n.includes("出库")) return "出库";
  return "入库";
}

function historyExecutor(row: { executor?: string; by?: string }) {
  const e = String(row.executor || "").trim();
  if (e) return e;
  return String(row.by || "").trim() || "—";
}

async function load() {
  const params: Record<string, string | number> = {
    skip: skip.value,
    limit: pageSize.value,
  };
  const ridRaw = filterRobotId.value;
  const rid = ridRaw == null ? "" : String(ridRaw).trim();
  if (rid) {
    params.robot_id = rid;
  }
  const { data } = await http.get("/api/parts", { params });
  const list = (data.items || []) as Record<string, unknown>[];
  const t = Number((data as { total?: number }).total);
  if (list.length === 0 && t > 0 && page.value > 1) {
    page.value = 1;
    return load();
  }
  items.value = list;
  total.value = Number.isFinite(t) ? t : 0;
}

function parseQty(s: string): number | null {
  const n = parseInt(String(s).trim(), 10);
  if (Number.isNaN(n) || n < 0) return null;
  return n;
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
    remark: "",
    status: PART_STATUS[0],
    quantity: "0",
    robot_id: "",
    image_url: "",
    created_at: "",
    updated_at: "",
    executor: "",
  });
  formDlg.value = true;
}

async function openEdit(row: Record<string, unknown>) {
  formMode.value = "edit";
  editingId.value = String(row._id);
  imagePickLabel.value = "";
  pendingImageFile.value = null;
  await loadRobotOptions();
  const { data } = await http.get(`/api/parts/${editingId.value}`);
  const auth = useAuthStore();
  form.name = String(data.name || "");
  form.description = String(data.description || "");
  form.remark = String(data.remark || "");
  form.status = String(data.status || PART_STATUS[0]);
  form.quantity = String(data.quantity ?? 0);
  form.robot_id = data.robot_id != null ? String(data.robot_id) : "";
  form.image_url = String(data.image_url || "");
  form.created_at = String(data.created_at || "");
  form.updated_at = String(data.updated_at || "");
  form.executor = String(
    (data.updated_by as string) || (data.created_by as string) || auth.username || ""
  ).trim();
  formDlg.value = true;
}

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
    const { data } = await http.post("/api/parts/upload-image", fd, {
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

async function saveForm() {
  const qty = parseQty(form.quantity);
  if (qty === null) {
    ElMessage.warning("请输入有效的配件数量（非负整数）");
    return;
  }
  saving.value = true;
  try {
    if (!(await uploadPendingImage())) {
      return;
    }
    const robot_id = form.robot_id?.trim() || "";
    if (formMode.value === "add") {
      await http.post("/api/parts", {
        name: form.name,
        description: form.description,
        remark: form.remark,
        status: form.status,
        quantity: qty,
        image_url: form.image_url,
        robot_id,
      });
    } else if (editingId.value) {
      await http.put(`/api/parts/${editingId.value}`, {
        name: form.name,
        description: form.description,
        remark: form.remark,
        status: form.status,
        quantity: qty,
        image_url: form.image_url,
        robot_id,
        executor: (form.executor ?? "").trim(),
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
  detailTab.value = "inbound";
  detailDlg.value = true;
}

async function onDetailOpened() {
  const id = detailId.value;
  if (!id) return;
  try {
    const { data } = await http.get(`/api/parts/${id}`);
    detailPartName.value = String(data.name || "");
    detailPartStatus.value = String(data.status || "");
    detailPartQuantity.value = String(data.quantity ?? "");
    detailPartRemark.value = String(data.remark || "");
    detailInbound.value = (data.inbound_history || []) as InboundRow[];
    detailUpdates.value = (data.update_history || []) as UpdateRow[];
  } catch {
    detailPartName.value = "";
    detailPartStatus.value = "";
    detailPartQuantity.value = "";
    detailPartRemark.value = "";
    detailInbound.value = [];
    detailUpdates.value = [];
  }
}

async function remove(row: Record<string, unknown>) {
  await ElMessageBox.confirm(`确定删除配件「${row.name}」？`, "删除", { type: "warning" });
  await http.delete(`/api/parts/${row._id}`);
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

.detail-head {
  margin-bottom: 16px;
}

.detail-tabs {
  margin-top: 4px;
}

.detail-remark {
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.5;
  color: var(--el-text-color-primary);
}
</style>
