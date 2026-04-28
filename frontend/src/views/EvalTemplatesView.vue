<template>
  <el-card>
    <template #header>
      <div class="row">
        <span>世界模型素材库 / 评测模板</span>
        <el-button v-if="canWrite" type="primary" @click="openCreate">新建模板</el-button>
      </div>
    </template>

    <el-table :data="items" row-key="_id" border stripe>
      <el-table-column label="序号" width="72" align="center">
        <template #default="{ $index }">{{ revIdx($index) }}</template>
      </el-table-column>
      <el-table-column prop="_id" label="模板ID" width="220" show-overflow-tooltip />
      <el-table-column prop="name" label="模板名称" width="160" show-overflow-tooltip />
      <el-table-column prop="description" label="模板描述" min-width="180" show-overflow-tooltip />
      <el-table-column prop="status" label="模板状态" width="100" />
      <el-table-column prop="version" label="模板版本号" width="100" />
      <el-table-column label="步骤(k:v)" min-width="220" show-overflow-tooltip>
        <template #default="{ row }">
          {{ stepsSummary(row) }}
        </template>
      </el-table-column>
      <el-table-column label="模板创建时间" width="180">
        <template #default="{ row }">{{ formatDateTime(row.created_at) }}</template>
      </el-table-column>
      <el-table-column label="模板更新时间" width="180">
        <template #default="{ row }">{{ formatDateTime(row.updated_at) }}</template>
      </el-table-column>
      <el-table-column prop="created_by" label="模板创建人" width="120" show-overflow-tooltip />
      <el-table-column prop="updated_by" label="模板更新人" width="120" show-overflow-tooltip />
      <el-table-column v-if="canWrite" label="操作" width="140" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
          <el-button link type="danger" @click="removeRow(row)">删除</el-button>
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

    <el-dialog v-model="dlg" :title="editingId ? '编辑评测模板' : '新建评测模板'" width="760px">
      <el-form :model="form" label-width="120px">
        <el-form-item label="模板名称" required>
          <el-input v-model="form.name" />
        </el-form-item>
        <el-form-item label="模板描述">
          <el-input v-model="form.description" type="textarea" :rows="3" />
        </el-form-item>
        <el-form-item label="模板状态" required>
          <el-select v-model="form.status" style="width: 220px">
            <el-option v-for="s in EVAL_TEMPLATE_STATUS" :key="s" :label="s" :value="s" />
          </el-select>
        </el-form-item>
        <el-form-item label="模板版本号" required>
          <el-input v-model="form.version" style="width: 220px" placeholder="如 1.0（一位小数）" />
        </el-form-item>
        <el-divider content-position="left">步骤键值对（k=步骤名称，v=步骤分值）</el-divider>
        <div class="step-head">
          <span>步骤ID</span>
          <span>步骤名称(k)</span>
          <span>步骤分值(v)</span>
          <span class="step-head-actions">操作</span>
        </div>
        <div v-for="(s, idx) in form.steps" :key="idx" class="step-row">
          <el-input :model-value="String(s.step_id)" readonly />
          <el-input v-model="s.name" placeholder="例如：抓取位置正确性" />
          <el-input-number
            v-model="s.max_score"
            :min="0.01"
            :max="1000000"
            :precision="2"
            controls-position="right"
            style="width: 160px"
          />
          <div class="step-row-actions">
            <el-button link type="primary" title="在此步之前插入" @click="insertStepBefore(idx)">+</el-button>
            <el-button link type="danger" @click="removeStep(idx)">删除</el-button>
          </div>
        </div>
        <div class="step-foot">
          <el-button plain @click="addStep">添加步骤</el-button>
          <span class="muted">总分固定 100，新增/删除步骤时自动均分</span>
        </div>
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
import { ElMessage, ElMessageBox } from "element-plus";
import http from "@/api/http";
import { canWriteEvalTemplate } from "@/stores/auth";
import { EVAL_TEMPLATE_STATUS } from "@/constants/options";
import { formatDateTime } from "@/utils/datetime";
import { DEFAULT_PAGE_SIZE, reverseSerialIndex, skipForPage } from "@/utils/pagination";

type StepKV = { step_id: number; name: string; max_score: number };

const canWrite = computed(() => canWriteEvalTemplate());
const items = ref<Record<string, unknown>[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(DEFAULT_PAGE_SIZE);
const skip = computed(() => skipForPage(page.value, pageSize.value));

const dlg = ref(false);
const editingId = ref<string | null>(null);

const form = reactive({
  name: "",
  description: "",
  status: EVAL_TEMPLATE_STATUS[0],
  version: "1.0",
  steps: [] as StepKV[],
});

function revIdx($index: number) {
  return reverseSerialIndex(total.value, skip.value, $index);
}

function rebalanceStepScores() {
  const n = form.steps.length;
  if (n <= 0) return;
  const unit = Number((100 / n).toFixed(2));
  let sum = 0;
  for (let i = 0; i < n; i += 1) {
    if (i < n - 1) {
      form.steps[i].max_score = unit;
      sum += unit;
    } else {
      form.steps[i].max_score = Number((100 - sum).toFixed(2));
    }
  }
}

function resequenceStepIds() {
  for (let i = 0; i < form.steps.length; i += 1) {
    form.steps[i].step_id = i + 1;
  }
}

function addStep() {
  form.steps.push({ step_id: form.steps.length + 1, name: "", max_score: 0 });
  resequenceStepIds();
  rebalanceStepScores();
}

/** 在当前步骤之前插入一行（补漏步），末尾仍用「添加步骤」 */
function insertStepBefore(idx: number) {
  form.steps.splice(idx, 0, { step_id: 0, name: "", max_score: 0 });
  resequenceStepIds();
  rebalanceStepScores();
}

function removeStep(idx: number) {
  form.steps.splice(idx, 1);
  resequenceStepIds();
  rebalanceStepScores();
}

function stepsSummary(row: Record<string, unknown>) {
  const raw = row.steps as { step_id?: unknown; name?: unknown; max_score?: unknown }[] | undefined;
  if (!Array.isArray(raw) || raw.length === 0) return "—";
  return raw
    .map((s) => `${String(s?.step_id ?? "")}.${String(s?.name ?? "")}:${String(s?.max_score ?? "")}`)
    .filter((x) => x !== ":")
    .join("；");
}

async function load() {
  const { data } = await http.get("/api/evaluations/step-templates", {
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

function resetForm() {
  form.name = "";
  form.description = "";
  form.status = EVAL_TEMPLATE_STATUS[0];
  form.version = "1.0";
  form.steps.length = 0;
}

function openCreate() {
  editingId.value = null;
  resetForm();
  dlg.value = true;
}

function openEdit(row: Record<string, unknown>) {
  editingId.value = String(row._id);
  form.name = String(row.name || "");
  form.description = String(row.description || "");
  form.status = String(row.status || EVAL_TEMPLATE_STATUS[0]);
  form.version = String(row.version || "1.0");
  form.steps.length = 0;
  const raw = row.steps as StepKV[] | undefined;
  if (Array.isArray(raw)) {
    for (const s of raw) {
      form.steps.push({
        step_id: Number((s as { step_id?: unknown }).step_id) || form.steps.length + 1,
        name: String(s.name ?? ""),
        max_score: Number(s.max_score) > 0 ? Number(s.max_score) : 10,
      });
    }
    resequenceStepIds();
  }
  dlg.value = true;
}

async function save() {
  const name = form.name.trim();
  if (!name) {
    ElMessage.warning("请填写模板名称");
    return;
  }
  const steps = form.steps
    .map((s) => ({ step_id: s.step_id, name: String(s.name || "").trim(), max_score: Number(s.max_score) }))
    .filter((s) => s.name && s.max_score > 0);

  const body = {
    name,
    description: form.description,
    status: form.status,
    version: form.version,
    steps,
  };
  if (editingId.value) {
    await http.put(`/api/evaluations/step-templates/${editingId.value}`, body);
  } else {
    await http.post("/api/evaluations/step-templates", body);
  }
  dlg.value = false;
  ElMessage.success("已保存");
  await load();
}

async function removeRow(row: Record<string, unknown>) {
  await ElMessageBox.confirm("确定删除该评测模板？", "删除", { type: "warning" });
  await http.delete(`/api/evaluations/step-templates/${row._id}`);
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

.step-head,
.step-row {
  display: grid;
  grid-template-columns: 96px 1fr 170px 120px;
  gap: 10px;
  align-items: center;
}

.step-head-actions {
  text-align: left;
}

.step-row-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
}

.step-head {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-bottom: 8px;
}

.step-row {
  margin-bottom: 8px;
}

.step-foot {
  display: flex;
  gap: 10px;
  align-items: center;
}
</style>
