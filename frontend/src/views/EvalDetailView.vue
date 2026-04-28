<template>
  <el-card>
    <template #header>
      <div class="row">
        <el-button link @click="$router.push('/evaluations')">← 返回</el-button>
        <span class="header-title">评测录入 — 任务 <code class="task-id">{{ taskId }}</code></span>
      </div>
    </template>

    <el-divider>录入新记录</el-divider>
    <el-form
      :model="form"
      class="form entry-record-form"
      :class="{ 'form--narrow': narrowForm }"
      :label-position="narrowForm ? 'top' : 'left'"
      :label-width="narrowForm ? 'auto' : '118px'"
    >
      <el-row :gutter="narrowForm ? 0 : 20" class="entry-layout-row">
        <!-- 左：视频预览 → 选摄像头 → 录制操作 → 上传 -->
        <el-col :xs="24" :md="leftColSpan" class="entry-col entry-col--left">
          <el-form-item label="动作视频录制">
            <div class="rec">
              <div class="video-wrap">
                <video
                  v-show="camOn"
                  ref="videoEl"
                  class="preview"
                  autoplay
                  muted
                  playsinline
                />
                <div v-if="!camOn" class="preview placeholder">监控画面：请先开启摄像头</div>
                <div v-if="recording" class="rec-badge">● 录制中</div>
              </div>
            </div>
          </el-form-item>
          <el-form-item label="选择摄像头">
            <div class="rec">
              <div v-if="videoDevices.length" class="cam-select-row cam-select-row--3">
                <el-select
                  v-model="selectedCameraId"
                  placeholder="选择摄像头"
                  filterable
                  clearable
                  class="cam-select"
                  :disabled="camOn || recording"
                >
                  <el-option label="系统默认（浏览器自行选择）" value="" />
                  <el-option
                    v-for="d in videoDevices"
                    :key="d.deviceId"
                    :label="d.label"
                    :value="d.deviceId"
                  />
                </el-select>
                <el-button link type="primary" :disabled="camOn || recording" @click="refreshVideoDevices">
                  刷新设备列表
                </el-button>
              </div>
              <div v-else-if="canEnumerateVideoDevices" class="cam-select-row cam-select-row--3">
                <span class="hint cam-hint-inline">未枚举到摄像头，若已连接可点刷新。</span>
                <el-button link type="primary" :disabled="camOn || recording" @click="refreshVideoDevices">
                  刷新设备列表
                </el-button>
              </div>
              <p v-if="videoDevices.length" class="hint">
                多摄像头时在此选择；设备名称在浏览器授权后会更准确。
              </p>
            </div>
          </el-form-item>
          <el-form-item label="开启摄像头">
            <div class="rec">
              <div class="btns btns-rec">
                <el-button v-if="!camOn" type="primary" @click="startCam">开启摄像头</el-button>
                <template v-else>
                  <el-button type="primary" :disabled="recording" @click="startRec">开始</el-button>
                  <el-button type="success" :disabled="!recording" :loading="uploadingRec" @click="stopRecSave">
                    保存
                  </el-button>
                  <el-button :disabled="!recording" @click="abortRec">放弃</el-button>
                  <el-button v-if="!recording" @click="stopCam">关闭</el-button>
                </template>
              </div>
              <p class="hint">开启摄像头后可「开始」；录制中可「保存」上传，或「放弃」丢弃本次片段。</p>
              <p v-if="showCamHttpHint" class="hint hint-warn">
                通过「局域网 IP + http」访问时，多数浏览器会禁止摄像头/麦克风；请改用本机
                <strong>localhost</strong> 或 <strong>https</strong>，或直接使用右侧「或上传 mp4」。
              </p>
              <div v-if="uploadedUrl" class="muted">已上传：{{ uploadedUrl }}</div>
            </div>
          </el-form-item>
          <el-form-item label="或上传 mp4">
            <el-upload :auto-upload="false" :show-file-list="false" accept="video/mp4,video/webm" @change="onUploadFile">
              <el-button>选择文件上传</el-button>
            </el-upload>
          </el-form-item>
        </el-col>
        <!-- 中：描述 → 结果 → 时间 → 提交（贴右栏底部） -->
        <el-col :xs="24" :md="midColSpan" class="entry-col entry-col--right entry-col--right-wrap">
          <div class="entry-col--right-body">
            <el-form-item label="动作执行描述">
              <el-input v-model="form.action_description" type="textarea" :rows="descRows" />
            </el-form-item>
            <el-form-item label="执行结果" required>
              <el-select v-model="form.result" class="result-select">
                <el-option v-for="r in EVAL_RECORD_RESULT" :key="r" :label="r" :value="r" />
              </el-select>
            </el-form-item>
            <el-form-item label="执行时间">
              <el-input v-model="durationStr" readonly placeholder="0S（保存或上传后按视频时长、默认 30 帧/秒换算）" />
            </el-form-item>
          </div>
          <el-form-item class="form-actions form-actions--right-bottom" label-width="0">
            <el-button type="primary" :loading="saving" @click="submitRecord">提交记录</el-button>
          </el-form-item>
        </el-col>
        <!-- 右：步骤打分（评测任务配置） -->
        <el-col v-if="hasTaskSteps" :xs="24" :md="stepColSpan" class="entry-col entry-col--steps">
          <div class="steps-panel">
            <div class="steps-panel-title">评测步骤 · 打分</div>
            <div class="steps-panel-hint muted">单项不超过满分，提交时自动汇总总分</div>
            <div v-for="(st, idx) in taskSteps" :key="st.id" class="step-score-row">
              <div class="step-score-label">
                <span class="step-index">第{{ idx + 1 }}步</span>
                <span class="step-name">{{ st.name }}</span>
                <span class="step-max">满分 {{ st.max_score }}</span>
              </div>
              <div class="step-score-actions step-score-toolbar">
                <el-input-number
                  v-model="stepScoreMap[st.id]"
                  :min="0"
                  :max="st.max_score"
                  :precision="2"
                  controls-position="right"
                  class="step-score-input"
                />
                <el-button class="step-score-btn" size="small" type="warning" plain @click="markStepRetry(st.id, st.max_score)">Retry</el-button>
                <el-button class="step-score-btn" size="small" type="success" plain @click="markStepSuccess(st.id, st.max_score)">Success</el-button>
                <el-button class="step-score-btn" size="small" type="danger" plain @click="markStepFail(st.id)">Fail</el-button>
              </div>
            </div>
            <div class="steps-panel-total">
              总分：<strong>{{ stepTotalDisplay }}</strong>
            </div>
          </div>
        </el-col>
      </el-row>
    </el-form>

    <el-divider>已有记录</el-divider>
    <el-table :data="records" row-key="_id" border stripe>
      <el-table-column label="序号" width="72" align="center">
        <template #default="{ $index }">{{ revIdx($index) }}</template>
      </el-table-column>
      <el-table-column prop="_id" label="记录ID" width="200" show-overflow-tooltip />
      <el-table-column prop="action_description" label="动作描述" />
      <el-table-column prop="result" label="结果" width="90" />
      <el-table-column prop="duration_seconds" label="时长(S)" width="100" />
      <el-table-column label="步骤总分" width="100" align="right">
        <template #default="{ row }">
          {{ formatRecordTotal(row) }}
        </template>
      </el-table-column>
      <el-table-column label="步骤详情" width="100" align="center">
        <template #default="{ row }">
          <el-button link type="primary" :disabled="!hasRowStepDetail(row)" @click="openRecordStepDetail(row)">查看</el-button>
        </template>
      </el-table-column>
      <el-table-column prop="created_at" label="创建时间" width="180">
        <template #default="{ row }">{{ formatDateTime(row.created_at) }}</template>
      </el-table-column>
      <el-table-column label="视频" width="220">
        <template #default="{ row }">
          <LazyTableVideo
            v-if="row.video_url"
            :key="String(row._id)"
            :src="resolveMediaUrl(String(row.video_url))"
          />
          <span v-else>—</span>
        </template>
      </el-table-column>
      <el-table-column v-if="canWrite" label="操作" width="120" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="openEditRecord(row)">编辑</el-button>
          <el-button link type="danger" @click="del(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>
    <el-pagination
      v-model:current-page="recPage"
      v-model:page-size="recPageSize"
      :total="recTotal"
      :page-sizes="[10, 20, 50, 100]"
      :layout="pagerLayout"
      class="table-pager"
    />

    <el-dialog v-model="editDlg" title="编辑测试记录" width="560px" @closed="onEditClosed">
      <el-form :model="editForm" label-width="120px">
        <el-form-item label="记录ID">
          <el-input :model-value="editId" readonly />
        </el-form-item>
        <el-form-item label="动作执行描述">
          <el-input v-model="editForm.action_description" type="textarea" :rows="4" />
        </el-form-item>
        <el-form-item label="动作执行结果" required>
          <el-select v-model="editForm.result" style="width: 200px">
            <el-option v-for="r in EVAL_RECORD_RESULT" :key="r" :label="r" :value="r" />
          </el-select>
        </el-form-item>
        <el-form-item label="时长(S)">
          <el-input-number v-model="editForm.duration_seconds" :min="0" :step="1" />
        </el-form-item>
        <template v-if="hasTaskSteps">
          <el-divider>评测步骤得分</el-divider>
          <div v-for="(st, idx) in taskSteps" :key="'edit-' + st.id" class="step-score-row-edit step-score-toolbar">
            <span class="step-index">第{{ idx + 1 }}步</span>
            <span class="step-name">{{ st.name }}</span>
            <span class="muted">满分 {{ st.max_score }}</span>
            <el-input-number
              v-model="editStepScoreMap[st.id]"
              :min="0"
              :max="st.max_score"
              :precision="2"
              controls-position="right"
              class="step-score-input step-score-input--edit"
            />
            <el-button class="step-score-btn" size="small" type="warning" plain @click="markEditStepRetry(st.id, st.max_score)">Retry</el-button>
            <el-button class="step-score-btn" size="small" type="success" plain @click="markEditStepSuccess(st.id, st.max_score)">Success</el-button>
            <el-button class="step-score-btn" size="small" type="danger" plain @click="markEditStepFail(st.id)">Fail</el-button>
          </div>
        </template>
        <el-form-item label="重传视频">
          <el-upload :auto-upload="false" :show-file-list="false" accept="video/mp4,video/webm" @change="onEditUploadFile">
            <el-button>选择 mp4/webm</el-button>
          </el-upload>
          <p v-if="editForm.video_url" class="muted">当前视频 URL：{{ editForm.video_url }}</p>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editDlg = false">取消</el-button>
        <el-button type="primary" :loading="editSaving" @click="saveEditRecord">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="recordStepDlg" title="步骤详情" width="680px">
      <el-table :data="recordStepItems" border stripe>
        <el-table-column prop="step_index" label="第几步" width="90" align="center" />
        <el-table-column prop="step_id" label="步骤ID" width="120" />
        <el-table-column prop="step_name" label="步骤名称" min-width="180" show-overflow-tooltip />
        <el-table-column prop="max_score" label="满分" width="90" align="right" />
        <el-table-column prop="score" label="得分" width="90" align="right" />
      </el-table>
      <template #footer>
        <el-button @click="recordStepDlg = false">关闭</el-button>
      </template>
    </el-dialog>

  </el-card>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from "vue";
import { useRoute } from "vue-router";
import http from "@/api/http";
import { ElMessage, ElMessageBox } from "element-plus";
import { EVAL_RECORD_RESULT } from "@/constants/options";
import { canWriteMaterial } from "@/stores/auth";
import LazyTableVideo from "@/components/LazyTableVideo.vue";
import { resolveMediaUrl } from "@/utils/media";
import { formatDateTime } from "@/utils/datetime";
import { DEFAULT_PAGE_SIZE, reverseSerialIndex, skipForPage } from "@/utils/pagination";

const FORM_NARROW_MQ = "(max-width: 768px)";
const mqFormNarrow = typeof window !== "undefined" ? window.matchMedia(FORM_NARROW_MQ) : null;
const narrowForm = ref(mqFormNarrow?.matches ?? false);

const pagerLayout = computed(() =>
  narrowForm.value ? "total, prev, pager, next" : "total, sizes, prev, pager, next, jumper"
);

/** 宽屏双列时左侧描述多给几行，窄屏保持 4 行 */
const descRows = computed(() => (narrowForm.value ? 4 : 10));

const route = useRoute();
const taskId = computed(() => String(route.params.taskId));

const taskDetail = ref<Record<string, unknown> | null>(null);
const stepScoreMap = reactive<Record<string, number>>({});
const editStepScoreMap = reactive<Record<string, number>>({});
/** 每步 Retry：1→80% 满分，2→50%，第 3 次归零重计 */
const stepRetryMap = reactive<Record<string, number>>({});
const editStepRetryMap = reactive<Record<string, number>>({});

function roundStepScore(v: number): number {
  return Math.round((v + Number.EPSILON) * 100) / 100;
}

const taskSteps = computed(() => {
  const raw = taskDetail.value?.steps;
  if (!Array.isArray(raw)) return [];
  return raw as { id: string; name: string; max_score: number }[];
});
const hasTaskSteps = computed(() => taskSteps.value.length > 0);

const leftColSpan = computed(() => {
  if (narrowForm.value) return 24;
  return hasTaskSteps.value ? 8 : 12;
});
const midColSpan = computed(() => {
  if (narrowForm.value) return 24;
  return hasTaskSteps.value ? 8 : 12;
});
const stepColSpan = computed(() => {
  if (narrowForm.value) return 24;
  return hasTaskSteps.value ? 8 : 24;
});

const stepTotalDisplay = computed(() => {
  let t = 0;
  for (const st of taskSteps.value) {
    t += Number(stepScoreMap[st.id] ?? 0);
  }
  if (!Number.isFinite(t)) return 0;
  return Math.round(t * 10000) / 10000;
});

function formatRecordTotal(row: Record<string, unknown>) {
  const v = row.total_score;
  if (v === undefined || v === null) return "—";
  return String(v);
}

const recordStepDlg = ref(false);
const recordStepItems = ref<
  { step_index: number; step_id: string; step_name: string; max_score: number; score: number }[]
>([]);

function hasRowStepDetail(row: Record<string, unknown>) {
  const raw = row.step_scores;
  return Array.isArray(raw) && raw.length > 0;
}

function openRecordStepDetail(row: Record<string, unknown>) {
  const raw = (row.step_scores as { step_id?: unknown; score?: unknown }[] | undefined) || [];
  const byId = new Map<string, number>();
  for (const s of raw) {
    const sid = String(s?.step_id ?? "");
    if (!sid) continue;
    byId.set(sid, Number(s?.score ?? 0));
  }

  const steps = taskSteps.value;
  const built: typeof recordStepItems.value = [];
  if (steps.length > 0) {
    for (let i = 0; i < steps.length; i += 1) {
      const st = steps[i];
      built.push({
        step_index: i + 1,
        step_id: st.id,
        step_name: st.name,
        max_score: Number(st.max_score) || 0,
        score: Number(byId.get(st.id) ?? 0),
      });
    }
  } else {
    let idx = 1;
    for (const s of raw) {
      built.push({
        step_index: idx,
        step_id: String(s?.step_id ?? ""),
        step_name: String(s?.step_id ?? ""),
        max_score: 0,
        score: Number(s?.score ?? 0),
      });
      idx += 1;
    }
  }
  recordStepItems.value = built;
  recordStepDlg.value = true;
}

function markStepSuccess(stepId: string, maxScore: number) {
  stepRetryMap[stepId] = 0;
  stepScoreMap[stepId] = Number(maxScore) || 0;
}

function markStepFail(stepId: string) {
  stepRetryMap[stepId] = 0;
  stepScoreMap[stepId] = 0;
}

/** 第 1 次 80%，第 2 次 50%，第 3 次分数与 retry 归零（重计） */
function markStepRetry(stepId: string, maxScore: number) {
  const mx = Number(maxScore) || 0;
  if (mx <= 0) return;
  const n = stepRetryMap[stepId] ?? 0;
  if (n === 0) {
    stepScoreMap[stepId] = roundStepScore(mx * 0.8);
    stepRetryMap[stepId] = 1;
  } else if (n === 1) {
    stepScoreMap[stepId] = roundStepScore(mx * 0.5);
    stepRetryMap[stepId] = 2;
  } else if (n === 2) {
    stepScoreMap[stepId] = 0;
    stepRetryMap[stepId] = 0;
  }
}

function markEditStepSuccess(stepId: string, maxScore: number) {
  editStepRetryMap[stepId] = 0;
  editStepScoreMap[stepId] = Number(maxScore) || 0;
}

function markEditStepFail(stepId: string) {
  editStepRetryMap[stepId] = 0;
  editStepScoreMap[stepId] = 0;
}

function markEditStepRetry(stepId: string, maxScore: number) {
  const mx = Number(maxScore) || 0;
  if (mx <= 0) return;
  const n = editStepRetryMap[stepId] ?? 0;
  if (n === 0) {
    editStepScoreMap[stepId] = roundStepScore(mx * 0.8);
    editStepRetryMap[stepId] = 1;
  } else if (n === 1) {
    editStepScoreMap[stepId] = roundStepScore(mx * 0.5);
    editStepRetryMap[stepId] = 2;
  } else if (n === 2) {
    editStepScoreMap[stepId] = 0;
    editStepRetryMap[stepId] = 0;
  }
}

async function loadTaskDetail() {
  try {
    const { data } = await http.get(`/api/evaluations/tasks/${taskId.value}`);
    taskDetail.value = data as Record<string, unknown>;
    for (const k of Object.keys(stepScoreMap)) {
      delete stepScoreMap[k];
    }
    for (const k of Object.keys(stepRetryMap)) {
      delete stepRetryMap[k];
    }
    for (const st of taskSteps.value) {
      stepScoreMap[st.id] = 0;
      stepRetryMap[st.id] = 0;
    }
  } catch {
    taskDetail.value = null;
  }
}

const form = ref({
  action_description: "",
  result: EVAL_RECORD_RESULT[0],
});
/** 与视频换算时长一致：默认按 30fps 取整帧再折算为秒（入库为整数秒） */
const DEFAULT_VIDEO_FPS = 30;

const durationSeconds = ref(0);
const durationStr = computed(() => `${durationSeconds.value}S`);

const camOn = ref(false);
const uploadedUrl = ref<string | null>(null);
const uploadedCover = ref<string | null>(null);
const recording = ref(false);
const uploadingRec = ref(false);
const saving = ref(false);
let stream: MediaStream | null = null;
let recorder: MediaRecorder | null = null;
const chunks: BlobPart[] = [];
let discardRecording = false;
const videoEl = ref<HTMLVideoElement | null>(null);
const records = ref<Record<string, unknown>[]>([]);
const recTotal = ref(0);
const recPage = ref(1);
const recPageSize = ref(DEFAULT_PAGE_SIZE);
const recSkip = computed(() => skipForPage(recPage.value, recPageSize.value));

function revIdx($index: number) {
  return reverseSerialIndex(recTotal.value, recSkip.value, $index);
}
const canWrite = computed(() => canWriteMaterial());

const editDlg = ref(false);
const editId = ref<string | null>(null);
const editForm = ref({
  action_description: "",
  result: EVAL_RECORD_RESULT[0],
  duration_seconds: 0,
  video_url: null as string | null,
});
const editSaving = ref(false);
const editVideoTouched = ref(false);

const PREF_CAMERA_STORAGE_KEY = "ss-eval-pref-camera-id";

type VideoDeviceOption = { deviceId: string; label: string };

const videoDevices = ref<VideoDeviceOption[]>([]);

function readStoredCameraId(): string {
  try {
    return localStorage.getItem(PREF_CAMERA_STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

const selectedCameraId = ref(readStoredCameraId());

function invalidateCameraSelectionIfMissing() {
  const list = videoDevices.value;
  if (selectedCameraId.value && !list.some((d) => d.deviceId === selectedCameraId.value)) {
    selectedCameraId.value = "";
    try {
      localStorage.removeItem(PREF_CAMERA_STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }
}

async function refreshVideoDevices() {
  if (!navigator.mediaDevices?.enumerateDevices) {
    videoDevices.value = [];
    return;
  }
  try {
    const all = await navigator.mediaDevices.enumerateDevices();
    videoDevices.value = all
      .filter((d) => d.kind === "videoinput")
      .map((d, i) => ({
        deviceId: d.deviceId,
        label: (d.label && d.label.trim()) || `摄像头 ${i + 1}`,
      }));
    invalidateCameraSelectionIfMissing();
  } catch {
    /* ignore */
  }
}

watch(selectedCameraId, (v) => {
  const id = typeof v === "string" && v.trim() ? v.trim() : "";
  try {
    if (id) localStorage.setItem(PREF_CAMERA_STORAGE_KEY, id);
    else localStorage.removeItem(PREF_CAMERA_STORAGE_KEY);
  } catch {
    /* ignore */
  }
});

/** http 且非 localhost 时，浏览器常禁用 getUserMedia，提前提示 */
const showCamHttpHint = computed(() => {
  if (typeof window === "undefined") return false;
  const { hostname, protocol } = window.location;
  if (protocol === "https:") return false;
  if (hostname === "localhost" || hostname === "127.0.0.1") return false;
  return true;
});

const canEnumerateVideoDevices = computed(
  () => typeof navigator !== "undefined" && !!navigator.mediaDevices?.enumerateDevices
);

function mediaErrorMessage(err: unknown): string {
  const e = err as { name?: string; message?: string };
  const name = String(e?.name || "");
  const tail = " 也可直接使用下方「上传 mp4」。";
  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    return `浏览器或系统拒绝了摄像头/麦克风权限，请在地址栏「站点信息」中允许，并检查系统隐私设置。${tail}`;
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return `未检测到可用的摄像头或麦克风设备。${tail}`;
  }
  if (name === "NotReadableError" || name === "TrackStartError") {
    return `设备无法打开，可能被其他应用占用。${tail}`;
  }
  if (name === "SecurityError" || name === "TypeError") {
    return `安全限制：请使用 https，或仅在 http://localhost / 127.0.0.1 访问；用局域网 IP + http 时通常无法使用摄像头。${tail}`;
  }
  if (name === "OverconstrainedError") {
    return `当前摄像头参数不满足，已尝试放宽约束仍失败。${tail}`;
  }
  const detail = e?.message ? `（${e.message}）` : "";
  return `无法访问摄像头/麦克风${detail}。${tail}`;
}

function pickMime(): string {
  // 优先 H.264 MP4：Safari / iOS 上 WebM 常无法解码，录制为 MP4 可正常在列表中回放（若浏览器支持）
  const mp4 = [
    "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
    "video/mp4;codecs=avc1,mp4a.40.2",
    "video/mp4;codecs=hvc1,mp4a.40.2",
    "video/mp4",
  ];
  for (const t of mp4) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)) return t;
  }
  const c = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
  for (const t of c) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)) return t;
  }
  return "video/webm";
}

async function loadRecords() {
  const { data } = await http.get(`/api/evaluations/tasks/${taskId.value}/records`, {
    params: { skip: recSkip.value, limit: recPageSize.value },
  });
  const list = (data.items || []) as Record<string, unknown>[];
  const t = Number((data as { total?: number }).total);
  if (list.length === 0 && t > 0 && recPage.value > 1) {
    recPage.value = 1;
    return loadRecords();
  }
  records.value = list;
  recTotal.value = Number.isFinite(t) ? t : 0;
}

async function startCam() {
  stopCam();
  if (!navigator.mediaDevices?.getUserMedia) {
    ElMessage.error(
      "当前环境不支持调用摄像头（多为非安全连接：请使用 https 或 http://localhost；用局域网 IP + http 时通常不可用）。可直接使用下方「上传 mp4」。",
      { duration: 8000 }
    );
    return;
  }
  await refreshVideoDevices();
  const deviceId = selectedCameraId.value.trim();
  const attempts: MediaStreamConstraints[] = [];
  if (deviceId) {
    attempts.push({ video: { deviceId: { exact: deviceId } }, audio: true });
    attempts.push({ video: { deviceId: { exact: deviceId } }, audio: false });
  }
  attempts.push({ video: { facingMode: "user" }, audio: true });
  attempts.push({ video: true, audio: true });
  attempts.push({ video: true, audio: false });
  let lastErr: unknown = null;
  for (const c of attempts) {
    try {
      stream = await navigator.mediaDevices.getUserMedia(c);
      lastErr = null;
      break;
    } catch (e) {
      lastErr = e;
      stream = null;
    }
  }
  if (!stream) {
    ElMessage.error(mediaErrorMessage(lastErr), { duration: 9000 });
    return;
  }
  await refreshVideoDevices();
  camOn.value = true;
  await nextTick();
  if (videoEl.value) {
    videoEl.value.srcObject = stream;
    try {
      await videoEl.value.play();
    } catch {
      /* ignore */
    }
  }
}

function stopCam() {
  if (recorder && recorder.state !== "inactive") {
    try {
      recorder.stop();
    } catch {
      /* ignore */
    }
  }
  recorder = null;
  recording.value = false;
  chunks.length = 0;
  discardRecording = false;
  if (stream) {
    stream.getTracks().forEach((t) => t.stop());
    stream = null;
  }
  if (videoEl.value) {
    videoEl.value.srcObject = null;
  }
  camOn.value = false;
}

function startRec() {
  if (!stream || recording.value) return;
  chunks.length = 0;
  discardRecording = false;
  const mime = pickMime();
  try {
    recorder = new MediaRecorder(stream, { mimeType: mime });
  } catch {
    recorder = new MediaRecorder(stream);
  }
  recorder.ondataavailable = (e: BlobEvent) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };
  recorder.onstop = () => {
    if (discardRecording) {
      chunks.length = 0;
      discardRecording = false;
      return;
    }
  };
  recorder.start(200);
  recording.value = true;
  durationSeconds.value = 0;
}

async function stopRecSave() {
  if (!recorder || recorder.state === "inactive" || !recording.value) {
    ElMessage.warning("请先开始");
    return;
  }
  discardRecording = false;
  uploadingRec.value = true;
  try {
    await new Promise<void>((resolve, reject) => {
      const r = recorder!;
      r.onstop = async () => {
        try {
          const blob = new Blob(chunks, { type: r.mimeType || "video/webm" });
          chunks.length = 0;
          durationSeconds.value = await estimateDuration(blob);
          const ext = blob.type.includes("mp4") ? "mp4" : "webm";
          const file = new File([blob], `capture-${Date.now()}.${ext}`, { type: blob.type || "video/webm" });
          const fd = new FormData();
          fd.append("file", file);
          const { data } = await http.post(`/api/evaluations/tasks/${taskId.value}/records/upload-video`, fd, {
            headers: { "Content-Type": "multipart/form-data" },
          });
          uploadedUrl.value = data.video_url;
          recording.value = false;
          recorder = null;
          ElMessage.success("录制已保存并上传");
          resolve();
        } catch (e) {
          reject(e);
        }
      };
      r.stop();
    });
  } catch {
    ElMessage.error("上传失败");
    recording.value = false;
    recorder = null;
  } finally {
    uploadingRec.value = false;
  }
}

function abortRec() {
  if (!recording.value || !recorder) {
    ElMessage.warning("当前未在录制");
    return;
  }
  discardRecording = true;
  try {
    if (recorder.state !== "inactive") recorder.stop();
  } catch {
    /* ignore */
  }
  chunks.length = 0;
  recording.value = false;
  recorder = null;
  ElMessage.info("已放弃本次录制");
}

/** 读取媒体时间轴长度（秒）；处理 MediaRecorder WebM 常见的 duration === Infinity */
function probeVideoTimelineSeconds(blob: Blob): Promise<number> {
  return new Promise((resolve) => {
    const v = document.createElement("video");
    v.muted = true;
    v.preload = "metadata";
    const url = URL.createObjectURL(blob);
    v.src = url;

    const finish = (sec: number) => {
      URL.revokeObjectURL(url);
      v.removeAttribute("src");
      v.load();
      resolve(Number.isFinite(sec) && sec > 0 ? sec : 0);
    };

    const read = () => {
      const d = v.duration;
      if (Number.isFinite(d) && d !== Infinity) {
        finish(d);
        return;
      }
      v.currentTime = 1e10;
      v.onseeked = () => {
        v.onseeked = null;
        const after = v.duration;
        finish(Number.isFinite(after) ? after : 0);
      };
    };

    v.onloadedmetadata = () => read();
    v.onerror = () => finish(0);
  });
}

/** 默认 30fps：帧数 = round(时间轴秒数 × 30)，入库时长(秒) = ceil(帧数 / 30)，避免 1 帧被算成 0 秒 */
async function estimateDuration(blob: Blob): Promise<number> {
  const seconds = await probeVideoTimelineSeconds(blob);
  if (seconds <= 0) return 0;
  const frameCount = Math.max(0, Math.round(seconds * DEFAULT_VIDEO_FPS));
  if (frameCount < 1 && seconds > 1e-3) {
    return 1;
  }
  return Math.max(0, Math.ceil(frameCount / DEFAULT_VIDEO_FPS));
}

async function onUploadFile(uploadFile: { raw?: File }) {
  const f = uploadFile.raw;
  if (!f) return;
  const fd = new FormData();
  fd.append("file", f);
  const { data } = await http.post(`/api/evaluations/tasks/${taskId.value}/records/upload-video`, fd, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  uploadedUrl.value = data.video_url;
  durationSeconds.value = await estimateDuration(f);
  ElMessage.success("已上传");
}

async function submitRecord() {
  saving.value = true;
  try {
    const body: Record<string, unknown> = {
      action_description: form.value.action_description,
      video_url: uploadedUrl.value,
      cover_url: uploadedCover.value,
      result: form.value.result,
      duration_seconds: durationSeconds.value,
    };
    if (hasTaskSteps.value) {
      body.step_scores = taskSteps.value.map((st) => ({
        step_id: st.id,
        score: Number(stepScoreMap[st.id] ?? 0),
      }));
    }
    await http.post(`/api/evaluations/tasks/${taskId.value}/records`, body);
    ElMessage.success("已提交");
    form.value.action_description = "";
    uploadedUrl.value = null;
    durationSeconds.value = 0;
    for (const st of taskSteps.value) {
      stepScoreMap[st.id] = 0;
      stepRetryMap[st.id] = 0;
    }
    await loadRecords();
  } finally {
    saving.value = false;
  }
}

function openEditRecord(row: Record<string, unknown>) {
  editId.value = String(row._id ?? "");
  const res = String(row.result ?? "");
  const result =
    EVAL_RECORD_RESULT.find((r) => r === res) ?? EVAL_RECORD_RESULT[0];
  editForm.value = {
    action_description: String(row.action_description ?? ""),
    result,
    duration_seconds: Math.max(0, Math.floor(Number(row.duration_seconds) || 0)),
    video_url: row.video_url != null && String(row.video_url) ? String(row.video_url) : null,
  };
  for (const k of Object.keys(editStepScoreMap)) {
    delete editStepScoreMap[k];
  }
  for (const k of Object.keys(editStepRetryMap)) {
    delete editStepRetryMap[k];
  }
  const rowScores = row.step_scores as { step_id?: string; score?: number }[] | undefined;
  for (const st of taskSteps.value) {
    const found = Array.isArray(rowScores) ? rowScores.find((x) => x?.step_id === st.id) : undefined;
    editStepScoreMap[st.id] = found != null ? Number(found.score) : 0;
    editStepRetryMap[st.id] = 0;
  }
  editVideoTouched.value = false;
  editDlg.value = true;
}

function onEditClosed() {
  editId.value = null;
  editVideoTouched.value = false;
}

async function onEditUploadFile(uploadFile: { raw?: File }) {
  const f = uploadFile.raw;
  if (!f) return;
  const fd = new FormData();
  fd.append("file", f);
  const { data } = await http.post(`/api/evaluations/tasks/${taskId.value}/records/upload-video`, fd, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  editForm.value.video_url = data.video_url;
  editForm.value.duration_seconds = await estimateDuration(f);
  editVideoTouched.value = true;
  ElMessage.success("已更新视频");
}

async function saveEditRecord() {
  if (!editId.value) return;
  editSaving.value = true;
  try {
    const body: {
      action_description: string;
      result: string;
      duration_seconds: number;
      video_url?: string;
      step_scores?: { step_id: string; score: number }[];
    } = {
      action_description: editForm.value.action_description,
      result: editForm.value.result,
      duration_seconds: Math.max(0, Math.floor(Number(editForm.value.duration_seconds) || 0)),
    };
    if (editVideoTouched.value && editForm.value.video_url) {
      body.video_url = editForm.value.video_url;
    }
    if (hasTaskSteps.value) {
      body.step_scores = taskSteps.value.map((st) => ({
        step_id: st.id,
        score: Number(editStepScoreMap[st.id] ?? 0),
      }));
    }
    await http.put(`/api/evaluations/records/${editId.value}`, body);
    ElMessage.success("已保存");
    editDlg.value = false;
    await loadRecords();
  } finally {
    editSaving.value = false;
  }
}

async function del(row: Record<string, unknown>) {
  await ElMessageBox.confirm("删除该记录？", "确认", { type: "warning" });
  await http.delete(`/api/evaluations/records/${row._id}`);
  ElMessage.success("已删除");
  await loadRecords();
}

watch(
  () => taskId.value,
  () => {
    recPage.value = 1;
    void loadTaskDetail();
  },
  { immediate: true }
);
watch(recPageSize, () => {
  recPage.value = 1;
});
watch(
  [taskId, recPage, recPageSize],
  () => {
    void loadRecords();
  },
  { immediate: true }
);

let unbindFormNarrowMq: (() => void) | undefined;

onMounted(async () => {
  const onNarrowMq = () => {
    narrowForm.value = mqFormNarrow!.matches;
  };
  mqFormNarrow?.addEventListener("change", onNarrowMq);
  unbindFormNarrowMq = () => mqFormNarrow?.removeEventListener("change", onNarrowMq);
  await refreshVideoDevices();
});
onUnmounted(() => {
  unbindFormNarrowMq?.();
  stopCam();
});
</script>

<style scoped>
.row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.header-title {
  flex: 1;
  min-width: 0;
  font-weight: 600;
  font-size: 15px;
  line-height: 1.45;
  color: var(--el-text-color-primary);
}

.task-id {
  display: inline;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New",
    monospace;
  font-size: 12px;
  font-weight: 500;
  word-break: break-all;
  color: var(--el-text-color-regular);
  background: rgba(15, 23, 42, 0.06);
  padding: 2px 6px;
  border-radius: 4px;
}

.form {
  max-width: min(1280px, 100%);
  width: 100%;
  margin-inline: auto;
  box-sizing: border-box;
}

/* 两列等高，便于右栏提交按钮贴底 */
.entry-layout-row {
  align-items: stretch !important;
}

/* 整块录入：标签与多行控件顶部对齐，留白统一，避免像「中间画了线」 */
.entry-record-form:not(.form--narrow)
  :deep(
    .entry-col--left > .el-form-item,
    .entry-col--right-body .el-form-item,
    .form-actions--right-bottom
  ) {
  align-items: flex-start;
}

.entry-record-form:not(.form--narrow)
  :deep(
    .entry-col--left > .el-form-item .el-form-item__label-wrap,
    .entry-col--right-body .el-form-item .el-form-item__label-wrap
  ) {
  align-items: flex-start;
}

.entry-record-form:not(.form--narrow)
  :deep(
    .entry-col--left > .el-form-item .el-form-item__label,
    .entry-col--right-body .el-form-item .el-form-item__label
  ) {
  padding-top: 2px;
  line-height: 22px;
  height: auto !important;
}

.entry-record-form
  :deep(
    .entry-col--left > .el-form-item,
    .entry-col--right-body .el-form-item,
    .form-actions--right-bottom
  ) {
  margin-bottom: 18px;
  border: none !important;
  padding: 0;
}

.entry-record-form :deep(.entry-col--left > .el-form-item:last-of-type) {
  margin-bottom: 0;
}

.entry-record-form.form--narrow :deep(.el-form-item) {
  margin-bottom: 18px;
}

.entry-col--left,
.entry-col--right {
  min-width: 0;
}

.entry-col--right-wrap {
  display: flex;
  flex-direction: column;
}

.entry-col--right-body {
  flex: 1 1 auto;
  min-height: 0;
}

.form-actions--right-bottom {
  margin-top: auto;
  padding-top: 0;
  margin-bottom: 0 !important;
}

/* 与同表单 label-width 一致：与左侧「或上传 mp4」等内容区左对齐 */
.form-actions--right-bottom :deep(.el-form-item__content) {
  justify-content: flex-start;
  display: flex;
}

@media (min-width: 992px) {
  .entry-record-form:not(.form--narrow) .form-actions--right-bottom :deep(.el-form-item__content) {
    margin-left: 118px;
  }
}

.entry-col--left .preview,
.entry-col--left .placeholder {
  width: 100%;
  max-width: 420px;
}

.entry-col--left .video-wrap {
  max-width: 420px;
}

@media (min-width: 992px) {
  .entry-record-form:not(.form--narrow) .entry-col--right :deep(.el-textarea__inner) {
    min-height: 200px;
  }
  .entry-record-form:not(.form--narrow) .entry-col--right .result-select {
    width: 100%;
    max-width: 360px;
  }
  .entry-record-form:not(.form--narrow) .entry-col--right :deep(.el-input) {
    width: 100%;
    max-width: 360px;
  }
  .entry-record-form:not(.form--narrow) .cam-select-row--3 {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 8px;
  }
}

.result-select {
  width: min(240px, 100%);
}

.form--narrow .result-select {
  width: 100%;
  max-width: 360px;
}

.form--narrow.form .form-actions--right-bottom :deep(.el-form-item__content) {
  margin-left: 0 !important;
}

.form--narrow.form .form-actions--right-bottom :deep(.el-button) {
  width: 100%;
  max-width: 360px;
}

.entry-col--steps {
  min-width: 0;
}

.steps-panel {
  padding: 14px;
  border-radius: 10px;
  border: 1px solid rgba(15, 23, 42, 0.08);
  background: linear-gradient(180deg, #f8fafc 0%, #fff 100%);
}

.steps-panel-title {
  font-weight: 600;
  font-size: 15px;
  color: var(--el-text-color-primary);
  margin-bottom: 4px;
}

.steps-panel-hint {
  font-size: 12px;
  margin-bottom: 12px;
}

.step-score-row {
  margin-bottom: 14px;
}

.step-score-label {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 6px;
}

.step-score-label .step-index {
  font-size: 12px;
  color: var(--el-color-primary);
  font-weight: 600;
}

.step-score-label .step-name {
  font-weight: 500;
  color: var(--el-text-color-primary);
}

.step-score-label .step-max {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.step-score-input {
  width: 96px;
  max-width: 96px;
  flex-shrink: 0;
}

.step-score-input--edit {
  max-width: 96px;
}

.step-score-toolbar :deep(.step-score-input) {
  width: 96px;
  max-width: 96px;
}

.step-score-toolbar :deep(.step-score-input .el-input__wrapper) {
  padding-left: 6px;
  padding-right: 4px;
}

.step-score-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
}

.step-score-toolbar :deep(.step-score-btn.el-button--small) {
  padding: 2px 5px;
  font-size: 11px;
  min-height: 22px;
  margin-left: 0;
}

.step-score-toolbar :deep(.step-score-btn.el-button + .step-score-btn.el-button) {
  margin-left: 0;
}

.steps-panel-total {
  margin-top: 8px;
  padding-top: 10px;
  border-top: 1px dashed rgba(15, 23, 42, 0.1);
  font-size: 15px;
}

.step-score-row-edit {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 10px;
}

.step-score-row-edit .step-index {
  font-size: 12px;
  color: var(--el-color-primary);
  font-weight: 600;
}

.rec {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-width: 100%;
}
.video-wrap {
  position: relative;
  width: fit-content;
  max-width: 100%;
}
.preview {
  display: block;
  width: min(420px, 100%);
  max-width: 100%;
  max-height: 248px;
  background: #1a1a1a;
  border-radius: 8px;
  object-fit: cover;
}
.placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  width: min(420px, 100%);
  max-width: 100%;
  min-height: 180px;
  max-height: 248px;
  color: var(--app-text-muted);
  font-size: 14px;
  border: 1px dashed var(--el-border-color);
  border-radius: 8px;
}
.rec-badge {
  position: absolute;
  top: 8px;
  left: 8px;
  background: rgba(245, 108, 108, 0.95);
  color: #fff;
  padding: 4px 10px;
  border-radius: 4px;
  font-size: 12px;
  animation: pulse 1s ease infinite;
}
@keyframes pulse {
  50% {
    opacity: 0.85;
  }
}
.cam-select-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}
.cam-select {
  width: min(360px, 100%);
  max-width: 100%;
}
.btns {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}

/* 开始 / 保存 / 放弃 / 关闭 — 单行不换行，窄屏可横向滑动 */
.btns-rec {
  flex-wrap: nowrap;
  gap: 8px;
  max-width: 100%;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  padding-bottom: 2px;
}
.btns-rec :deep(.el-button) {
  flex: 0 0 auto;
  margin: 0 !important;
}
.hint {
  margin: 0;
  font-size: 12px;
  color: var(--app-text-hint);
  line-height: 1.5;
}
.hint-warn {
  margin-top: 8px;
  color: var(--el-text-color-secondary);
  background: rgba(245, 158, 11, 0.12);
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid rgba(245, 158, 11, 0.35);
}
.hint-warn strong {
  color: var(--el-text-color-primary);
}
.muted {
  font-size: 12px;
  color: var(--app-text-muted);
}

.table-pager {
  flex-wrap: wrap;
  row-gap: 8px;
}
</style>
