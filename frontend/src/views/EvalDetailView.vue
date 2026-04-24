<template>
  <el-card>
    <template #header>
      <div class="row">
        <el-button link @click="$router.push('/evaluations')">← 返回</el-button>
        <span>评测录入 — 任务 {{ taskId }}</span>
      </div>
    </template>

    <el-divider>录入新记录</el-divider>
    <el-form :model="form" label-width="140px" class="form">
      <el-form-item label="动作执行描述">
        <el-input v-model="form.action_description" type="textarea" :rows="4" />
      </el-form-item>
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
          <div v-if="videoDevices.length" class="cam-select-row">
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
          <div v-else-if="canEnumerateVideoDevices" class="cam-select-row">
            <span class="hint cam-hint-inline">未枚举到摄像头，若已连接可点刷新。</span>
            <el-button link type="primary" :disabled="camOn || recording" @click="refreshVideoDevices">
              刷新设备列表
            </el-button>
          </div>
          <p v-if="videoDevices.length" class="hint">
            多摄像头时在此选择；设备名称在浏览器授权后会更准确。
          </p>
          <div class="btns">
            <el-button v-if="!camOn" type="primary" @click="startCam">开启摄像头</el-button>
            <template v-else>
              <el-button type="primary" :disabled="recording" @click="startRec">开始录制</el-button>
              <el-button type="success" :disabled="!recording" :loading="uploadingRec" @click="stopRecSave">
                录制保存
              </el-button>
              <el-button :disabled="!recording" @click="abortRec">放弃录制</el-button>
              <el-button v-if="!recording" @click="stopCam">关闭摄像头</el-button>
            </template>
          </div>
          <p class="hint">开启摄像头后可「开始录制」；录制中可「录制保存」上传，或「放弃录制」丢弃本次片段。</p>
          <p v-if="showCamHttpHint" class="hint hint-warn">
            通过「局域网 IP + http」访问时，多数浏览器会禁止摄像头/麦克风；请改用本机
            <strong>localhost</strong> 或 <strong>https</strong>，或直接使用下方「上传 mp4」。
          </p>
          <div v-if="uploadedUrl" class="muted">已上传：{{ uploadedUrl }}</div>
        </div>
      </el-form-item>
      <el-form-item label="或上传 mp4">
        <el-upload :auto-upload="false" :show-file-list="false" accept="video/mp4,video/webm" @change="onUploadFile">
          <el-button>选择文件上传</el-button>
        </el-upload>
      </el-form-item>
      <el-form-item label="动作执行结果" required>
        <el-select v-model="form.result" style="width: 200px">
          <el-option v-for="r in EVAL_RECORD_RESULT" :key="r" :label="r" :value="r" />
        </el-select>
      </el-form-item>
      <el-form-item label="动作执行时间">
        <el-input v-model="durationStr" readonly placeholder="0S（保存或上传后按视频时长、默认 30 帧/秒换算）" />
      </el-form-item>
      <el-form-item>
        <el-button type="primary" :loading="saving" @click="submitRecord">提交录入</el-button>
      </el-form-item>
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
      <el-table-column prop="created_at" label="创建时间" width="180">
        <template #default="{ row }">{{ formatDateTime(row.created_at) }}</template>
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
      layout="total, sizes, prev, pager, next, jumper"
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
  </el-card>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { useRoute } from "vue-router";
import http from "@/api/http";
import { ElMessage, ElMessageBox } from "element-plus";
import { EVAL_RECORD_RESULT } from "@/constants/options";
import { canWriteMaterial } from "@/stores/auth";
import { resolveMediaUrl } from "@/utils/media";
import { formatDateTime } from "@/utils/datetime";
import { DEFAULT_PAGE_SIZE, reverseSerialIndex, skipForPage } from "@/utils/pagination";

const route = useRoute();
const taskId = computed(() => String(route.params.taskId));

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
    ElMessage.warning("请先开始录制");
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
    await http.post(`/api/evaluations/tasks/${taskId.value}/records`, {
      action_description: form.value.action_description,
      video_url: uploadedUrl.value,
      cover_url: uploadedCover.value,
      result: form.value.result,
      duration_seconds: durationSeconds.value,
    });
    ElMessage.success("已提交");
    form.value.action_description = "";
    uploadedUrl.value = null;
    durationSeconds.value = 0;
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
    } = {
      action_description: editForm.value.action_description,
      result: editForm.value.result,
      duration_seconds: Math.max(0, Math.floor(Number(editForm.value.duration_seconds) || 0)),
    };
    if (editVideoTouched.value && editForm.value.video_url) {
      body.video_url = editForm.value.video_url;
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
  }
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

onMounted(async () => {
  await refreshVideoDevices();
});
onUnmounted(() => {
  stopCam();
});
</script>

<style scoped>
.row {
  display: flex;
  align-items: center;
  gap: 12px;
}
.form {
  max-width: 900px;
}
.rec {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.video-wrap {
  position: relative;
  width: fit-content;
}
.preview {
  width: 360px;
  max-height: 270px;
  background: #1a1a1a;
  border-radius: 8px;
  object-fit: cover;
}
.placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 200px;
  color: var(--app-text-muted);
  font-size: 14px;
  border: 1px dashed var(--el-border-color);
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
  min-width: 260px;
  max-width: 100%;
  width: 360px;
}
.btns {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
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
</style>
