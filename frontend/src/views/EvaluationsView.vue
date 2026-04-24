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

    <el-dialog v-model="dlg" :title="dlgTitle" width="640px">
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
import { useRouter } from "vue-router";
import http from "@/api/http";
import { ElMessage, ElMessageBox } from "element-plus";
import { EVAL_TASK_TYPES, EVAL_TASK_STATUS } from "@/constants/options";
import { canWriteMaterial } from "@/stores/auth";
import { formatDateTime } from "@/utils/datetime";
import { DEFAULT_PAGE_SIZE, reverseSerialIndex, skipForPage } from "@/utils/pagination";

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

const canWrite = computed(() => canWriteMaterial());

const form = reactive({
  description: "",
  task_type: EVAL_TASK_TYPES[0],
  status: EVAL_TASK_STATUS[2],
  version: "1.0",
  material_id: "",
  material_name: "",
});

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

function openEdit(row: Record<string, unknown>) {
  editingId.value = String(row._id);
  form.description = String(row.description || "");
  form.task_type = String(row.task_type);
  form.status = String(row.status);
  form.version = String(row.version);
  form.material_id = row.material_id ? String(row.material_id) : "";
  form.material_name = String(row.material_name || "");
  dlg.value = true;
}

async function save() {
  if (!editingId.value) return;
  const body: Record<string, unknown> = {
    description: form.description,
    task_type: form.task_type,
    status: form.status,
    material_name: form.material_name || undefined,
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
</style>
