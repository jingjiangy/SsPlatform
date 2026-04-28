<template>
  <el-card>
    <template #header>
      <div class="hdr">
        <div>
          <el-button link @click="$router.push('/materials')">← 返回素材库</el-button>
        </div>
        <div class="meta">
          <span>世界模型素材ID：{{ materialId }}</span>
          <span>素材名称：{{ materialName }}</span>
        </div>
        <el-button v-if="canWrite" type="primary" @click="openCreateDialog">创建关联评测任务</el-button>
      </div>
    </template>
    <p v-if="!pagedList.length" class="empty">评测记录为空</p>
    <el-table v-else :data="pagedList" border stripe row-key="_id">
      <el-table-column label="序号" width="72" align="center">
        <template #default="{ $index }">{{ revIdx($index) }}</template>
      </el-table-column>
      <el-table-column prop="_id" label="任务ID" width="200" />
      <el-table-column prop="description" label="描述" />
      <el-table-column prop="task_type" label="类型" width="100" />
      <el-table-column prop="status" label="状态" width="100" />
      <el-table-column label="评测任务版本" width="120">
        <template #default="{ row }">{{ taskVersionCell(row) }}</template>
      </el-table-column>
      <el-table-column label="评测次数" width="120">
        <template #default="{ row }">{{ row.success_count }} / {{ row.total_count }}</template>
      </el-table-column>
      <el-table-column label="创建时间" width="180">
        <template #default="{ row }">{{ formatDateTime(row.created_at) }}</template>
      </el-table-column>
      <el-table-column label="更新时间" width="180">
        <template #default="{ row }">{{ formatDateTime(row.updated_at) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="240" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="goDetail(row)">执行评测</el-button>
          <el-button v-if="canWrite" link type="primary" @click="openEdit(row)">编辑</el-button>
          <el-button v-if="canWrite" link type="danger" @click="removeTask(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>
    <el-pagination
      v-if="materialId && total > 0"
      v-model:current-page="page"
      v-model:page-size="pageSize"
      :total="total"
      :page-sizes="[10, 20, 50, 100]"
      layout="total, sizes, prev, pager, next, jumper"
      class="table-pager"
    />

    <el-dialog v-model="addDlg" title="创建关联评测任务" width="560px">
      <el-form label-width="120px">
        <el-form-item label="评测记录描述" required>
          <el-input v-model="addDescription" type="textarea" :rows="4" placeholder="请输入评测任务描述" />
        </el-form-item>
        <el-form-item label="关联评测模板">
          <el-select
            v-model="selectedTemplateId"
            clearable
            filterable
            placeholder="可选，选择后自动带入模板步骤"
            style="width: 100%"
          >
            <el-option v-for="tpl in stepTemplates" :key="String(tpl._id)" :label="tpl.name" :value="String(tpl._id)" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="addDlg = false">取消</el-button>
        <el-button type="primary" @click="submitCreate">确定</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="dlg" title="修改评测任务" width="640px">
      <el-form :model="form" label-width="120px">
        <el-form-item label="描述">
          <el-input v-model="form.description" type="textarea" :rows="4" />
        </el-form-item>
        <el-form-item label="类型" required>
          <el-select v-model="form.task_type" style="width: 100%">
            <el-option v-for="t in EVAL_TASK_TYPES" :key="t" :label="t" :value="t" />
          </el-select>
        </el-form-item>
        <el-form-item label="状态" required>
          <el-select v-model="form.status" style="width: 100%">
            <el-option v-for="s in EVAL_TASK_STATUS" :key="s" :label="s" :value="s" />
          </el-select>
        </el-form-item>
        <el-form-item label="任务版本">
          <span class="muted">{{ form.version }}（由系统自动分配，不可改）</span>
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
import { computed, reactive, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import http from "@/api/http";
import { ElMessage, ElMessageBox } from "element-plus";
import { EVAL_TASK_TYPES, EVAL_TASK_STATUS } from "@/constants/options";
import { canWriteMaterial } from "@/stores/auth";
import { formatDateTime } from "@/utils/datetime";
import { DEFAULT_PAGE_SIZE, reverseSerialIndex, skipForPage } from "@/utils/pagination";

const route = useRoute();
const router = useRouter();
const materialId = computed(() => String(route.query.materialId || ""));
const materialName = computed(() => String(route.query.materialName || ""));
const pagedList = ref<Record<string, unknown>[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(DEFAULT_PAGE_SIZE);
const skip = computed(() => skipForPage(page.value, pageSize.value));

function revIdx($index: number) {
  return reverseSerialIndex(total.value, skip.value, $index);
}
const canWrite = computed(() => canWriteMaterial());
const addDlg = ref(false);
const addDescription = ref("");
const stepTemplates = ref<{ _id: string; name: string }[]>([]);
const selectedTemplateId = ref("");
const dlg = ref(false);
const editingId = ref<string | null>(null);
const form = reactive({
  description: "",
  task_type: EVAL_TASK_TYPES[0],
  status: EVAL_TASK_STATUS[2],
  version: "",
});

async function load() {
  if (!materialId.value) {
    pagedList.value = [];
    total.value = 0;
    return;
  }
  const { data } = await http.get("/api/evaluations/tasks", {
    params: {
      material_id: materialId.value,
      skip: skip.value,
      limit: pageSize.value,
    },
  });
  const list = (data.items || []) as Record<string, unknown>[];
  const t = Number((data as { total?: number }).total);
  if (list.length === 0 && t > 0 && page.value > 1) {
    page.value = 1;
    return load();
  }
  pagedList.value = list;
  total.value = Number.isFinite(t) ? t : 0;
}

function goDetail(row: Record<string, unknown>) {
  router.push({ name: "eval-detail", params: { taskId: String(row._id) } });
}

function openEdit(row: Record<string, unknown>) {
  editingId.value = String(row._id);
  form.description = String(row.description || "");
  form.task_type = String(row.task_type);
  form.status = String(row.status);
  form.version = String(row.version ?? "1.0");
  dlg.value = true;
}

async function save() {
  if (!editingId.value) return;
  await http.put(`/api/evaluations/tasks/${editingId.value}`, {
    description: form.description,
    task_type: form.task_type,
    status: form.status,
  });
  dlg.value = false;
  ElMessage.success("已保存");
  await load();
}

function openCreateDialog() {
  if (!materialId.value) return;
  addDescription.value = materialName.value ? `关联素材 ${materialName.value}` : "";
  selectedTemplateId.value = "";
  void loadTemplates();
  addDlg.value = true;
}

async function loadTemplates() {
  const { data } = await http.get("/api/evaluations/step-templates", { params: { limit: 200 } });
  stepTemplates.value = ((data.items || []) as { _id: string; name: string }[]).map((x) => ({
    _id: String(x._id),
    name: String(x.name || ""),
  }));
}

function taskVersionCell(row: Record<string, unknown>) {
  const v = row.version;
  if (v === undefined || v === null || v === "") return "—";
  return String(v);
}

async function submitCreate() {
  if (!materialId.value) return;
  const desc = addDescription.value.trim();
  if (!desc) {
    ElMessage.warning("请填写评测记录描述");
    return;
  }
  const { data } = await http.post<{ version?: string }>("/api/evaluations/tasks", {
    description: desc,
    task_type: EVAL_TASK_TYPES[0],
    status: EVAL_TASK_STATUS[2],
    material_id: materialId.value,
    material_name: materialName.value,
    template_id: selectedTemplateId.value || undefined,
  });
  addDlg.value = false;
  const ver = data.version != null && data.version !== "" ? String(data.version) : "";
  ElMessage.success(ver ? `已创建评测任务，任务版本 ${ver}` : "已创建评测任务");
  await load();
}

async function removeTask(row: Record<string, unknown>) {
  await ElMessageBox.confirm("确定删除该评测任务及其录入记录？", "删除", { type: "warning" });
  await http.delete(`/api/evaluations/tasks/${row._id}`);
  ElMessage.success("已删除");
  await load();
}

watch(
  () => materialId.value,
  () => {
    page.value = 1;
  }
);
watch(pageSize, () => {
  page.value = 1;
});
watch(
  [materialId, page, pageSize],
  () => {
    void load();
  },
  { immediate: true }
);
</script>

<style scoped>
.hdr {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.meta {
  display: flex;
  gap: 24px;
  font-weight: 600;
}
.empty {
  color: var(--app-text-muted);
  margin: 0;
}
.muted {
  color: var(--app-text-muted);
  font-size: 13px;
}
</style>
