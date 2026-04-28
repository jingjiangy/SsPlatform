<template>
  <el-card>
    <template #header>
      <div class="row">
        <span>评测记录 / 评测任务</span>
      </div>
    </template>
    <el-table :data="items" border stripe row-key="_id">
      <el-table-column label="序号" width="72" align="center">
        <template #default="{ $index }">{{ revIdx($index) }}</template>
      </el-table-column>
      <el-table-column prop="_id" label="任务ID" width="200" />
      <el-table-column prop="description" label="描述" min-width="160" show-overflow-tooltip />
      <el-table-column label="素材任务名称" min-width="140" show-overflow-tooltip>
        <template #default="{ row }">
          <el-button
            v-if="row.material_id"
            link
            type="primary"
            @click="goToMaterial(row)"
          >
            {{ row.material_name || String(row.material_id) }}
          </el-button>
          <span v-else>{{ row.material_name || "—" }}</span>
        </template>
      </el-table-column>
      <el-table-column label="素材版本号" width="100" show-overflow-tooltip>
        <template #default="{ row }">{{ row.material_version || "—" }}</template>
      </el-table-column>
      <el-table-column prop="task_type" label="类型" width="100" />
      <el-table-column prop="status" label="状态" width="100" />
      <el-table-column prop="version" label="版本" width="80" />
      <el-table-column label="成功/失败/总数" width="140">
        <template #default="{ row }">
          {{ row.success_count }} / {{ failCount(row) }} / {{ row.total_count }}
        </template>
      </el-table-column>
      <el-table-column prop="success_rate" label="成功率" width="90">
        <template #default="{ row }">{{ row.success_rate }}%</template>
      </el-table-column>
      <el-table-column prop="avg_video_seconds" label="平均视频时长" width="120">
        <template #default="{ row }">{{ row.avg_video_seconds }}S</template>
      </el-table-column>
      <el-table-column prop="template_id" label="评测模板ID" width="220" show-overflow-tooltip />
      <el-table-column prop="avg_total_score" label="评测步骤总分数" width="120" align="right">
        <template #default="{ row }">{{ row.avg_total_score ?? 0 }}</template>
      </el-table-column>
      <el-table-column label="评测步骤平均分详情" width="140" align="center">
        <template #default="{ row }">
          <el-button link type="primary" :disabled="!hasStepConfig(row)" @click="openStepAvgDialog(row)">查看</el-button>
        </template>
      </el-table-column>
      <el-table-column label="创建时间" width="180">
        <template #default="{ row }">{{ formatDateTime(row.created_at) }}</template>
      </el-table-column>
      <el-table-column label="更新时间" width="180">
        <template #default="{ row }">{{ formatDateTime(row.updated_at) }}</template>
      </el-table-column>
      <el-table-column label="评测管理" width="100" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="goDetail(row)">执行评测</el-button>
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

    <el-dialog v-model="dlg" :title="dlgTitle" width="720px" class="eval-task-dlg" @open="onDlgOpen">
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
        <el-form-item v-if="form.material_id" label="任务版本号">
          <span class="muted">{{ form.version }}（关联素材的任务由系统自动分配，不可改）</span>
        </el-form-item>
        <el-form-item v-else label="版本号" required>
          <el-input v-model="form.version" placeholder="如 1.0（一位小数）" />
        </el-form-item>
        <el-form-item label="关联素材ID">
          <el-input v-model="form.material_id" placeholder="可选" />
        </el-form-item>
        <el-form-item label="素材名称">
          <el-input v-model="form.material_name" placeholder="可选" />
        </el-form-item>

        <el-divider content-position="left">评测步骤（录入打分）</el-divider>
        <div class="step-actions-bar">
          <el-select v-model="selectedTplId" placeholder="载入步骤模板" filterable clearable style="width: 260px">
            <el-option v-for="t in stepTemplates" :key="String(t._id)" :label="t.name" :value="String(t._id)" />
          </el-select>
          <el-button type="primary" plain :disabled="!selectedTplId" @click="applyStepTemplate">载入</el-button>
          <el-button type="success" plain @click="saveStepsAsTemplate">保存为模板</el-button>
          <el-button plain @click="pushStepRow">添加步骤</el-button>
        </div>
        <div class="steps-edit-table">
          <div class="steps-edit-head">
            <span class="col-name">步骤名称</span>
            <span class="col-score">满分</span>
            <span class="col-act">操作</span>
          </div>
          <div v-for="(s, idx) in form.steps" :key="idx" class="steps-edit-row">
            <el-input v-model="s.name" placeholder="步骤名称" maxlength="256" show-word-limit />
            <el-input-number v-model="s.max_score" :min="0.01" :max="1000000" :precision="2" controls-position="right" />
            <div class="steps-edit-actions">
              <el-button link type="primary" title="在此步之前插入" @click="insertStepRowBefore(idx)">+</el-button>
              <el-button link type="danger" @click="removeStepRow(idx)">删除</el-button>
            </div>
          </div>
          <p v-if="!form.steps.length" class="muted step-empty">未配置步骤时，录入页不显示「步骤打分」列。</p>
        </div>
      </el-form>
      <template #footer>
        <el-button @click="dlg = false">取消</el-button>
        <el-button type="primary" @click="save">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="stepAvgDlg" title="Avg. step total" width="700px" @closed="resetStepAvgLang">
      <div class="step-avg-toolbar">
        <p class="step-avg-total-summary">Avg. step total: <strong>{{ stepAvgHeaderTotal }}</strong></p>
        <el-button
          size="small"
          plain
          :loading="stepAvgTranslating"
          @click="toggleStepAvgEnglish"
        >
          {{ stepAvgEnglishMode ? "To 中文" : "To English" }}
        </el-button>
      </div>
      <el-table v-loading="stepAvgLoading" :data="stepAvgItems" border stripe>
        <el-table-column prop="step_id" label="ID" width="120" />
        <el-table-column label="Name" min-width="200" show-overflow-tooltip>
          <template #default="{ row }">
            {{ stepAvgDisplayName(row) }}
          </template>
        </el-table-column>
        <el-table-column prop="max_score" label="Pts" width="100" align="right" />
        <el-table-column prop="avg_score" label="Avg" width="100" align="right" />
      </el-table>
    </el-dialog>
  </el-card>
</template>

<script setup lang="ts">
import { reactive, ref, computed, watch } from "vue";
import { useRouter } from "vue-router";
import http from "@/api/http";
import { ElMessage, ElMessageBox } from "element-plus";
import { EVAL_TASK_TYPES, EVAL_TASK_STATUS } from "@/constants/options";
import { canWriteMaterial } from "@/stores/auth";
import { formatDateTime } from "@/utils/datetime";
import { DEFAULT_PAGE_SIZE, reverseSerialIndex, skipForPage } from "@/utils/pagination";
import { translateZhToEnEval } from "@/utils/translateEval";

const router = useRouter();
const items = ref<Record<string, unknown>[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(DEFAULT_PAGE_SIZE);
const skip = computed(() => skipForPage(page.value, pageSize.value));

function revIdx($index: number) {
  return reverseSerialIndex(total.value, skip.value, $index);
}
const dlg = ref(false);
const editingId = ref<string | null>(null);
const stepAvgDlg = ref(false);
const stepAvgLoading = ref(false);
const stepAvgHeaderTotal = ref(0);
const stepAvgItems = ref<{ step_id: string; step_name: string; max_score: number; avg_score: number }[]>([]);
const stepAvgEnglishMode = ref(false);
const stepAvgTranslating = ref(false);
/** step_id → 英文步骤名缓存（当前弹窗会话内有效） */
const stepAvgNameEnById = reactive<Record<string, string>>({});

function resetStepAvgLang() {
  stepAvgEnglishMode.value = false;
  stepAvgTranslating.value = false;
  for (const k of Object.keys(stepAvgNameEnById)) {
    delete stepAvgNameEnById[k];
  }
}

function stepAvgDisplayName(row: { step_id: string; step_name: string }) {
  const sid = String(row.step_id ?? "");
  if (stepAvgEnglishMode.value && stepAvgNameEnById[sid]) {
    return stepAvgNameEnById[sid];
  }
  return row.step_name;
}

async function toggleStepAvgEnglish() {
  if (stepAvgEnglishMode.value) {
    stepAvgEnglishMode.value = false;
    return;
  }
  stepAvgTranslating.value = true;
  try {
    for (const row of stepAvgItems.value) {
      const sid = String(row.step_id ?? "");
      if (!sid || stepAvgNameEnById[sid]) continue;
      stepAvgNameEnById[sid] = await translateZhToEnEval(String(row.step_name ?? ""));
    }
    stepAvgEnglishMode.value = true;
  } catch {
    ElMessage.error("翻译失败，请稍后重试");
  } finally {
    stepAvgTranslating.value = false;
  }
}

const canWrite = computed(() => canWriteMaterial());

type EvalStepFormRow = { id?: string; name: string; max_score: number };

const form = reactive({
  description: "",
  task_type: EVAL_TASK_TYPES[0],
  status: EVAL_TASK_STATUS[2],
  version: "1.0",
  material_id: "",
  material_name: "",
  steps: [] as EvalStepFormRow[],
});

const stepTemplates = ref<{ _id: string; name: string; steps: { name: string; max_score: number }[] }[]>([]);
const selectedTplId = ref<string>("");

const dlgTitle = "修改评测任务";

async function load() {
  const { data } = await http.get("/api/evaluations/tasks", {
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

function goDetail(row: Record<string, unknown>) {
  router.push({ name: "eval-detail", params: { taskId: String(row._id) } });
}

function failCount(row: Record<string, unknown>) {
  const total = Number(row.total_count) || 0;
  const ok = Number(row.success_count) || 0;
  return Math.max(0, total - ok);
}

function hasStepConfig(row: Record<string, unknown>) {
  const steps = row.steps;
  return Array.isArray(steps) && steps.length > 0;
}

async function openStepAvgDialog(row: Record<string, unknown>) {
  const tid = String(row._id || "");
  if (!tid) return;
  resetStepAvgLang();
  stepAvgHeaderTotal.value = Number(row.avg_total_score) || 0;
  stepAvgLoading.value = true;
  try {
    const { data } = await http.get(`/api/evaluations/tasks/${tid}/step-avg`);
    stepAvgItems.value = ((data as { items?: unknown[] }).items || []) as typeof stepAvgItems.value;
    stepAvgDlg.value = true;
  } finally {
    stepAvgLoading.value = false;
  }
}

function goToMaterial(row: Record<string, unknown>) {
  if (!row.material_id) return;
  const mid = String(row.material_id);
  if (row.material_parent_id) {
    router.push({
      name: "material-versions",
      params: { parentId: String(row.material_parent_id) },
    });
    return;
  }
  router.push({ name: "materials", query: { expandMaterial: mid } });
}

async function loadStepTemplates() {
  const { data } = await http.get("/api/evaluations/step-templates", { params: { limit: 100 } });
  stepTemplates.value = (data.items || []) as typeof stepTemplates.value;
}

function onDlgOpen() {
  void loadStepTemplates();
}

function pushStepRow() {
  form.steps.push({ name: "", max_score: 10 });
}

/** 在当前步骤之前插入一行；末尾追加仍用「添加步骤」 */
function insertStepRowBefore(idx: number) {
  form.steps.splice(idx, 0, { name: "", max_score: 10 });
}

function removeStepRow(idx: number) {
  form.steps.splice(idx, 1);
}

function applyStepTemplate() {
  const id = selectedTplId.value;
  if (!id) return;
  const t = stepTemplates.value.find((x) => String(x._id) === id);
  if (!t || !t.steps?.length) {
    ElMessage.warning("该模板无步骤");
    return;
  }
  form.steps.length = 0;
  for (const s of t.steps) {
    form.steps.push({
      name: String(s.name ?? ""),
      max_score: Number(s.max_score) > 0 ? Number(s.max_score) : 10,
    });
  }
  ElMessage.success("已从模板载入步骤");
}

async function saveStepsAsTemplate() {
  const trimmed = form.steps
    .map((s) => ({
      name: String(s.name ?? "").trim(),
      max_score: Number(s.max_score),
    }))
    .filter((s) => s.name && s.max_score > 0);
  if (!trimmed.length) {
    ElMessage.warning("请先添加有效步骤（名称 + 满分）");
    return;
  }
  let name = "";
  try {
    const ret = await ElMessageBox.prompt("模板名称", "保存为步骤模板", {
      confirmButtonText: "保存",
      cancelButtonText: "取消",
      inputPattern: /\S+/,
      inputErrorMessage: "请输入名称",
    });
    name = String((ret as { value?: string }).value || "").trim();
  } catch {
    return;
  }
  if (!name) return;
  await http.post("/api/evaluations/step-templates", { name, steps: trimmed });
  ElMessage.success("已保存模板");
  await loadStepTemplates();
}

function openEdit(row: Record<string, unknown>) {
  editingId.value = String(row._id);
  form.description = String(row.description || "");
  form.task_type = String(row.task_type);
  form.status = String(row.status);
  form.version = String(row.version);
  form.material_id = row.material_id ? String(row.material_id) : "";
  form.material_name = String(row.material_name || "");
  const raw = row.steps as unknown;
  if (Array.isArray(raw) && raw.length) {
    form.steps.length = 0;
    for (const x of raw) {
      const o = x as { id?: string; name?: unknown; max_score?: unknown };
      form.steps.push({
        id: o.id ? String(o.id) : undefined,
        name: String(o.name ?? ""),
        max_score: Number(o.max_score) > 0 ? Number(o.max_score) : 10,
      });
    }
  } else {
    form.steps.length = 0;
  }
  selectedTplId.value = "";
  dlg.value = true;
}

async function save() {
  if (!editingId.value) return;
  const stepsPayload = form.steps
    .map((s) => ({
      ...(s.id ? { id: String(s.id) } : {}),
      name: String(s.name ?? "").trim(),
      max_score: Number(s.max_score),
    }))
    .filter((s) => s.name && s.max_score > 0);

  const body: Record<string, unknown> = {
    description: form.description,
    task_type: form.task_type,
    status: form.status,
    material_name: form.material_name || undefined,
    steps: stepsPayload,
  };
  if (!form.material_id) {
    body.version = form.version;
  }
  await http.put(`/api/evaluations/tasks/${editingId.value}`, body);
  dlg.value = false;
  ElMessage.success("已保存");
  await load();
}

async function remove(row: Record<string, unknown>) {
  await ElMessageBox.confirm("确定删除该评测任务及下属录入？", "删除", { type: "warning" });
  await http.delete(`/api/evaluations/tasks/${row._id}`);
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
.muted {
  color: var(--app-text-muted);
  font-size: 13px;
}

.step-actions-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  margin-bottom: 12px;
}

.steps-edit-table {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  padding: 8px 12px 12px;
  background: var(--el-fill-color-blank);
}

.steps-edit-head {
  display: grid;
  grid-template-columns: 1fr 140px 120px;
  gap: 10px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-bottom: 8px;
  padding: 0 4px;
}

.steps-edit-row {
  display: grid;
  grid-template-columns: 1fr 140px 120px;
  gap: 10px;
  align-items: center;
  margin-bottom: 8px;
}

.steps-edit-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
}

.step-empty {
  margin: 8px 4px 0;
  font-size: 13px;
}

.step-avg-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 12px;
}

.step-avg-total-summary {
  margin: 0;
  font-size: 14px;
}

.step-avg-toolbar .step-avg-total-summary {
  flex: 1;
  min-width: 200px;
}
</style>
