import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Table, Button, Modal, Form, Input, Select, InputNumber, Divider, message, Card, Tag, Upload, Tooltip } from "antd";
import { CheckCircleFilled, CloseCircleFilled, ReloadOutlined } from "@ant-design/icons";
import type { TablePaginationConfig } from "antd";
import { useParams, useNavigate } from "react-router-dom";
import http from "@/api/http";
import { EVAL_RECORD_RESULT, EVAL_RECORD_STATUS } from "@/constants/options";
import { canWriteMaterial } from "@/stores/auth";
import { resolveMediaUrl } from "@/utils/media";
import { formatDateTime } from "@/utils/datetime";
import { DEFAULT_PAGE_SIZE, reverseSerialIndex, skipForPage } from "@/utils/pagination";

type Row = Record<string, unknown>;
type TaskStep = { id: string; name: string; max_score: number; retry_ratios?: [number, number, number] };
type StepScoreItem = { step_id: string; score: number };
type RecordStepDetail = { step_index: number; step_id: string; step_name: string; max_score: number; score: number };

const PREF_CAMERA_KEY = "ss-eval-pref-camera-id";
const PREF_RESOLUTION_KEY = "ss-eval-pref-resolution";
const DEFAULT_FPS = 30;

// Candidate resolutions to probe, ordered highest to lowest
const RESOLUTION_CANDIDATES = [
  { w: 3840, h: 2160, label: "4K (3840×2160)" },
  { w: 2560, h: 1440, label: "2K (2560×1440)" },
  { w: 1920, h: 1080, label: "1080p (1920×1080)" },
  { w: 1280, h: 720,  label: "720p (1280×720)" },
  { w: 640,  h: 480,  label: "480p (640×480)" },
  { w: 320,  h: 240,  label: "240p (320×240)" },
];

type ResolutionOption = { value: string; label: string; w: number; h: number };

/** Probe which resolutions the given camera actually supports. */
async function probeResolutions(deviceId: string): Promise<ResolutionOption[]> {
  const supported: ResolutionOption[] = [];
  for (const { w, h, label } of RESOLUTION_CANDIDATES) {
    const constraints: MediaStreamConstraints = {
      video: deviceId
        ? { deviceId: { exact: deviceId }, width: { exact: w }, height: { exact: h } }
        : { width: { exact: w }, height: { exact: h } },
      audio: false,
    };
    try {
      const s = await navigator.mediaDevices.getUserMedia(constraints);
      s.getTracks().forEach((t) => t.stop());
      supported.push({ value: `${w}x${h}`, label, w, h });
    } catch {
      // not supported — skip
    }
  }
  return supported;
}

function pickMime(): string {
  const mp4 = ["video/mp4;codecs=avc1.42E01E,mp4a.40.2", "video/mp4;codecs=avc1,mp4a.40.2", "video/mp4"];
  for (const t of mp4) { if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)) return t; }
  const webm = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
  for (const t of webm) { if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)) return t; }
  return "video/webm";
}

function probeVideoSeconds(blob: Blob): Promise<number> {
  return new Promise((resolve) => {
    const v = document.createElement("video");
    v.muted = true; v.preload = "metadata";
    const url = URL.createObjectURL(blob);
    v.src = url;
    const finish = (s: number) => { URL.revokeObjectURL(url); v.removeAttribute("src"); v.load(); resolve(Number.isFinite(s) && s > 0 ? s : 0); };
    v.onloadedmetadata = () => {
      const d = v.duration;
      if (Number.isFinite(d) && d !== Infinity) { finish(d); return; }
      v.currentTime = 1e10;
      v.onseeked = () => { v.onseeked = null; finish(Number.isFinite(v.duration) ? v.duration : 0); };
    };
    v.onerror = () => finish(0);
  });
}

async function estimateDuration(blob: Blob): Promise<number> {
  const s = await probeVideoSeconds(blob);
  if (s <= 0) return 0;
  const frames = Math.max(0, Math.round(s * DEFAULT_FPS));
  if (frames < 1 && s > 1e-3) return 1;
  return Math.max(0, Math.ceil(frames / DEFAULT_FPS));
}

function roundScore(v: number) { return Math.round((v + Number.EPSILON) * 100) / 100; }

function mediaErrorMsg(err: unknown): string {
  const e = err as { name?: string; message?: string };
  const tail = " 也可直接使用下方「上传 mp4」。";
  const n = String(e?.name || "");
  if (n === "NotAllowedError" || n === "PermissionDeniedError") return `浏览器拒绝了摄像头权限，请在地址栏允许。${tail}`;
  if (n === "NotFoundError" || n === "DevicesNotFoundError") return `未检测到摄像头设备。${tail}`;
  if (n === "NotReadableError" || n === "TrackStartError") return `设备无法打开，可能被其他应用占用。${tail}`;
  if (n === "SecurityError" || n === "TypeError") return `安全限制：请使用 https 或 http://localhost。${tail}`;
  return `无法访问摄像头${e?.message ? `（${e.message}）` : ""}。${tail}`;
}

export default function EvalDetailView() {
  const { taskId } = useParams<{ taskId: string }>();
  const navigate = useNavigate();
  const canWrite = canWriteMaterial();

  // task detail & steps
  const [taskDetail, setTaskDetail] = useState<Row | null>(null);
  const taskSteps = useMemo<TaskStep[]>(() => {
    const raw = taskDetail?.steps;
    if (!Array.isArray(raw)) return [];
    return raw as TaskStep[];
  }, [taskDetail]);
  const hasTaskSteps = taskSteps.length > 0;

  // records list
  const [records, setRecords] = useState<Row[]>([]);
  const [recTotal, setRecTotal] = useState(0);
  const [recPage, setRecPage] = useState(1);
  const [recPageSize, setRecPageSize] = useState(DEFAULT_PAGE_SIZE);
  const recSkip = useMemo(() => skipForPage(recPage, recPageSize), [recPage, recPageSize]);

  // entry form
  const [actionDesc, setActionDesc] = useState("");
  const [result, setResult] = useState(EVAL_RECORD_RESULT[0]);
  const [recordStatus, setRecordStatus] = useState(EVAL_RECORD_STATUS[0]);
  const [durationSeconds, setDurationSeconds] = useState(0);
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // step scores for new record
  const [stepScoreMap, setStepScoreMap] = useState<Record<string, number>>({});
  const [stepRetryMap, setStepRetryMap] = useState<Record<string, number>>({});
  const [stepStateMap, setStepStateMap] = useState<Record<string, "success" | "fail" | "retry" | null>>({});

  // camera / recording
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const discardRef = useRef(false);
  const [camOn, setCamOn] = useState(false);
  const [recording, setRecording] = useState(false);
  const [uploadingRec, setUploadingRec] = useState(false);
  const [videoDevices, setVideoDevices] = useState<{ deviceId: string; label: string }[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState(() => {
    try { return localStorage.getItem(PREF_CAMERA_KEY) || ""; } catch { return ""; }
  });
  const [resolutionOptions, setResolutionOptions] = useState<ResolutionOption[]>([]);
  const [selectedResolution, setSelectedResolution] = useState<string>(() => {
    try { return localStorage.getItem(PREF_RESOLUTION_KEY) || ""; } catch { return ""; }
  });
  const [probingRes, setProbingRes] = useState(false);
  const [actualResolution, setActualResolution] = useState<string>("");
  const showCamHttpHint = useMemo(() => {
    if (typeof window === "undefined") return false;
    const { hostname, protocol } = window.location;
    return protocol !== "https:" && hostname !== "localhost" && hostname !== "127.0.0.1";
  }, []);

  // edit record dialog
  const [editDlg, setEditDlg] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm] = Form.useForm();
  const [editStepScoreMap, setEditStepScoreMap] = useState<Record<string, number>>({});
  const [editStepRetryMap, setEditStepRetryMap] = useState<Record<string, number>>({});
  const [editStepStateMap, setEditStepStateMap] = useState<Record<string, "success" | "fail" | "retry" | null>>({});
  const [editVideoTouched, setEditVideoTouched] = useState(false);
  const [editSaving, setEditSaving] = useState(false);

  // step detail dialog
  const [stepDetailDlg, setStepDetailDlg] = useState(false);
  const [stepDetailItems, setStepDetailItems] = useState<RecordStepDetail[]>([]);

  // video preview dialog
  const [previewVideoUrl, setPreviewVideoUrl] = useState("");
  const [previewVideoDlg, setPreviewVideoDlg] = useState(false);

  const stepTotal = useMemo(() => {
    let t = 0;
    for (const st of taskSteps) t += Number(stepScoreMap[st.id] ?? 0);
    return Number.isFinite(t) ? Math.round(t * 10000) / 10000 : 0;
  }, [stepScoreMap, taskSteps]);

  // ── data loading ──────────────────────────────────────────────────────────
  const loadTaskDetail = useCallback(async () => {
    if (!taskId) return;
    try {
      const { data } = await http.get(`/api/evaluations/tasks/${taskId}`);
      setTaskDetail(data as Row);
      const steps = (Array.isArray((data as Row).steps) ? (data as Row).steps : []) as TaskStep[];
      const scores: Record<string, number> = {};
      const retries: Record<string, number> = {};
      const states: Record<string, null> = {};
      for (const st of steps) { scores[st.id] = 0; retries[st.id] = 0; states[st.id] = null; }
      setStepScoreMap(scores);
      setStepRetryMap(retries);
      setStepStateMap(states);
    } catch { setTaskDetail(null); }
  }, [taskId]);

  const loadRecords = useCallback(async () => {
    if (!taskId) return;
    const { data } = await http.get(`/api/evaluations/tasks/${taskId}/records`, { params: { skip: recSkip, limit: recPageSize } });
    const list = (data.items || []) as Row[];
    const t = Number(data.total);
    if (list.length === 0 && t > 0 && recPage > 1) { setRecPage(1); return; }
    setRecords(list); setRecTotal(Number.isFinite(t) ? t : 0);
  }, [taskId, recSkip, recPageSize, recPage]);

  useEffect(() => { void loadTaskDetail(); }, [loadTaskDetail]);
  useEffect(() => { void loadRecords(); }, [loadRecords]);

  // ── camera helpers ────────────────────────────────────────────────────────
  const refreshVideoDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) { setVideoDevices([]); return; }
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      const vids = all.filter((d) => d.kind === "videoinput").map((d, i) => ({ deviceId: d.deviceId, label: (d.label && d.label.trim()) || `摄像头 ${i + 1}` }));
      setVideoDevices(vids);
      setSelectedCameraId((prev) => {
        if (prev && !vids.some((d) => d.deviceId === prev)) {
          try { localStorage.removeItem(PREF_CAMERA_KEY); } catch { /* ignore */ }
          return "";
        }
        return prev;
      });
    } catch { /* ignore */ }
  }, []);

  const stopCam = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      try { recorderRef.current.stop(); } catch { /* ignore */ }
    }
    recorderRef.current = null;
    chunksRef.current = [];
    discardRef.current = false;
    setRecording(false);
    if (streamRef.current) { streamRef.current.getTracks().forEach((t) => t.stop()); streamRef.current = null; }
    if (videoRef.current) videoRef.current.srcObject = null;
    setCamOn(false);
    setActualResolution("");
  }, []);

  const startCam = useCallback(async () => {
    stopCam();
    if (!navigator.mediaDevices?.getUserMedia) {
      message.error("当前环境不支持摄像头（请使用 https 或 http://localhost）。可直接使用下方「上传 mp4」。", 8);
      return;
    }
    await refreshVideoDevices();
    const deviceId = selectedCameraId.trim();

    // Build constraints: prefer selected resolution, fall back to no constraint
    const res = selectedResolution ? selectedResolution.split("x").map(Number) : null;
    const videoBase: MediaTrackConstraints = deviceId ? { deviceId: { exact: deviceId } } : { facingMode: "user" };
    const videoWithRes: MediaTrackConstraints = res && res.length === 2
      ? { ...videoBase, width: { ideal: res[0] }, height: { ideal: res[1] } }
      : videoBase;

    const attempts: MediaStreamConstraints[] = [
      { video: videoWithRes, audio: true },
      { video: videoWithRes, audio: false },
      ...(deviceId ? [
        { video: { deviceId: { exact: deviceId } }, audio: true } as MediaStreamConstraints,
        { video: { deviceId: { exact: deviceId } }, audio: false } as MediaStreamConstraints,
      ] : []),
      { video: { facingMode: "user" }, audio: true },
      { video: true, audio: true },
      { video: true, audio: false },
    ];

    let lastErr: unknown = null;
    let s: MediaStream | null = null;
    for (const c of attempts) { try { s = await navigator.mediaDevices.getUserMedia(c); lastErr = null; break; } catch (e) { lastErr = e; s = null; } }
    if (!s) { message.error(mediaErrorMsg(lastErr), 9); return; }
    streamRef.current = s;

    // Read actual resolution from the track
    const vTrack = s.getVideoTracks()[0];
    if (vTrack) {
      const settings = vTrack.getSettings();
      if (settings.width && settings.height) {
        setActualResolution(`${settings.width}×${settings.height}`);
      }
    }

    await refreshVideoDevices();
    setCamOn(true);
    setTimeout(() => {
      if (videoRef.current) { videoRef.current.srcObject = s; videoRef.current.play().catch(() => { /* ignore */ }); }
    }, 0);
  }, [stopCam, refreshVideoDevices, selectedCameraId, selectedResolution]);

  /** Probe supported resolutions for the currently selected camera. */
  const handleProbeResolutions = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) return;
    setProbingRes(true);
    setResolutionOptions([]);
    try {
      const deviceId = selectedCameraId.trim();
      const opts = await probeResolutions(deviceId);
      setResolutionOptions(opts);
      // Default to the highest supported resolution
      if (opts.length > 0) {
        const best = opts[0].value;
        setSelectedResolution((prev) => {
          // Keep user's saved preference if it's still in the list
          if (prev && opts.some((o) => o.value === prev)) return prev;
          try { localStorage.setItem(PREF_RESOLUTION_KEY, best); } catch { /* ignore */ }
          return best;
        });
      }
    } finally {
      setProbingRes(false);
    }
  }, [selectedCameraId]);

  const startRec = useCallback(() => {
    if (!streamRef.current || recording) return;
    chunksRef.current = [];
    discardRef.current = false;
    const mime = pickMime();
    let rec: MediaRecorder;
    try { rec = new MediaRecorder(streamRef.current, { mimeType: mime }); } catch { rec = new MediaRecorder(streamRef.current); }
    rec.ondataavailable = (e: BlobEvent) => { if (e.data && e.data.size > 0) chunksRef.current.push(e.data); };
    rec.start(200);
    recorderRef.current = rec;
    setRecording(true);
    setDurationSeconds(0);
  }, [recording]);

  const flushRecording = useCallback(async (quiet = false): Promise<{ videoUrl: string; duration: number }> => {
    const rec = recorderRef.current;
    const hasChunks = chunksRef.current.length > 0;

    // recorder already stopped but chunks buffered — upload directly
    if ((!rec || rec.state === "inactive") && hasChunks) {
      setUploadingRec(true);
      try {
        const mimeType = rec?.mimeType || "video/webm";
        const blob = new Blob(chunksRef.current, { type: mimeType });
        chunksRef.current = [];
        const dur = await estimateDuration(blob);
        setDurationSeconds(dur);
        const ext = blob.type.includes("mp4") ? "mp4" : "webm";
        const file = new File([blob], `capture-${Date.now()}.${ext}`, { type: blob.type || "video/webm" });
        const fd = new FormData(); fd.append("file", file);
        const { data } = await http.post(`/api/evaluations/tasks/${taskId}/records/upload-video`, fd, { headers: { "Content-Type": "multipart/form-data" } });
        const videoUrl = (data as { video_url: string }).video_url;
        setUploadedUrl(videoUrl);
        setRecording(false); recorderRef.current = null;
        if (!quiet) message.success("录制已保存并上传");
        return { videoUrl, duration: dur };
      } catch { setRecording(false); recorderRef.current = null; throw new Error("upload_failed"); }
      finally { setUploadingRec(false); }
    }

    if (!rec || rec.state === "inactive") return { videoUrl: uploadedUrl || "", duration: durationSeconds };

    discardRef.current = false;
    setUploadingRec(true);
    try {
      return await new Promise<{ videoUrl: string; duration: number }>((resolve, reject) => {
        rec.onstop = async () => {
          try {
            const blob = new Blob(chunksRef.current, { type: rec.mimeType || "video/webm" });
            chunksRef.current = [];
            const dur = await estimateDuration(blob);
            setDurationSeconds(dur);
            const ext = blob.type.includes("mp4") ? "mp4" : "webm";
            const file = new File([blob], `capture-${Date.now()}.${ext}`, { type: blob.type || "video/webm" });
            const fd = new FormData(); fd.append("file", file);
            const { data } = await http.post(`/api/evaluations/tasks/${taskId}/records/upload-video`, fd, { headers: { "Content-Type": "multipart/form-data" } });
            const videoUrl = (data as { video_url: string }).video_url;
            setUploadedUrl(videoUrl);
            setRecording(false); recorderRef.current = null;
            if (!quiet) message.success("录制已保存并上传");
            resolve({ videoUrl, duration: dur });
          } catch (e) { reject(e); }
        };
        rec.stop();
      });
    } catch { setRecording(false); recorderRef.current = null; throw new Error("upload_failed"); }
    finally { setUploadingRec(false); }
  }, [taskId, uploadedUrl, durationSeconds]);

  const stopRecSave = useCallback(async () => {
    if (!recorderRef.current || recorderRef.current.state === "inactive" || !recording) { message.warning("请先开始录制"); return; }
    try { await flushRecording(false); } catch { message.error("上传失败"); }
  }, [recording, flushRecording]);

  const abortRec = useCallback(() => {
    if (!recording || !recorderRef.current) { message.warning("当前未在录制"); return; }
    discardRef.current = true;
    try { if (recorderRef.current.state !== "inactive") recorderRef.current.stop(); } catch { /* ignore */ }
    chunksRef.current = []; setRecording(false); recorderRef.current = null;
    message.info("已放弃本次录制");
  }, [recording]);

  // ── upload file ───────────────────────────────────────────────────────────
  const onUploadFile = useCallback(async (file: File) => {
    const fd = new FormData(); fd.append("file", file);
    const { data } = await http.post(`/api/evaluations/tasks/${taskId}/records/upload-video`, fd, { headers: { "Content-Type": "multipart/form-data" } });
    setUploadedUrl((data as { video_url: string }).video_url);
    setDurationSeconds(await estimateDuration(file));
    message.success("已上传");
    return false;
  }, [taskId]);

  // ── step score helpers ────────────────────────────────────────────────────
  function markStep(
    id: string,
    maxScore: number,
    action: "success" | "fail" | "retry",
    setter: React.Dispatch<React.SetStateAction<Record<string, number>>>,
    retrySetter: React.Dispatch<React.SetStateAction<Record<string, number>>>,
    stateSetter: React.Dispatch<React.SetStateAction<Record<string, "success" | "fail" | "retry" | null>>>,
    retryRatios?: [number, number, number],
  ) {
    const ratios: [number, number, number] = retryRatios ?? [0.8, 0.5, 0.0];
    if (action === "success") {
      retrySetter((p) => ({ ...p, [id]: 0 }));
      setter((p) => ({ ...p, [id]: Number(maxScore) || 0 }));
      stateSetter((p) => ({ ...p, [id]: "success" }));
    } else if (action === "fail") {
      retrySetter((p) => ({ ...p, [id]: 0 }));
      setter((p) => ({ ...p, [id]: 0 }));
      stateSetter((p) => ({ ...p, [id]: "fail" }));
    } else {
      retrySetter((prev) => {
        const n = prev[id] ?? 0;
        const mx = Number(maxScore) || 0;
        if (mx <= 0) return prev;
        // n=0 → first retry, n=1 → second retry, n=2 → third retry → reset
        if (n < ratios.length) {
          setter((p) => ({ ...p, [id]: roundScore(mx * ratios[n]) }));
          stateSetter((p) => ({ ...p, [id]: "retry" }));
          return { ...prev, [id]: n + 1 };
        }
        // exceeded all retries → reset
        setter((p) => ({ ...p, [id]: 0 }));
        stateSetter((p) => ({ ...p, [id]: null }));
        return { ...prev, [id]: 0 };
      });
    }
  }

  // ── submit record ─────────────────────────────────────────────────────────
  const submitRecord = useCallback(async () => {
    setSaving(true);
    try {
      let videoUrl = uploadedUrl;
      let dur = durationSeconds;
      if (recording || chunksRef.current.length > 0) {
        try {
          const flushed = await flushRecording(true);
          videoUrl = flushed.videoUrl || videoUrl;
          dur = flushed.duration || dur;
        } catch {
          message.error("录制保存失败，请重试");
          return;
        }
      }
      const body: Record<string, unknown> = { action_description: actionDesc, video_url: videoUrl, result, status: recordStatus, duration_seconds: dur };
      if (hasTaskSteps) body.step_scores = taskSteps.map((st) => ({ step_id: st.id, score: Number(stepScoreMap[st.id] ?? 0) }));
      await http.post(`/api/evaluations/tasks/${taskId}/records`, body);
      message.success("已提交");
      setActionDesc(""); setUploadedUrl(null); setDurationSeconds(0); setRecordStatus(EVAL_RECORD_STATUS[0]);
      const scores: Record<string, number> = {}; const retries: Record<string, number> = {}; const states: Record<string, null> = {};
      for (const st of taskSteps) { scores[st.id] = 0; retries[st.id] = 0; states[st.id] = null; }
      setStepScoreMap(scores); setStepRetryMap(retries); setStepStateMap(states);
      await loadRecords();
    } finally { setSaving(false); }
  }, [recording, flushRecording, actionDesc, uploadedUrl, result, recordStatus, durationSeconds, hasTaskSteps, taskSteps, stepScoreMap, taskId, loadRecords]);

  // ── edit record ───────────────────────────────────────────────────────────
  function openEditRecord(row: Row) {
    setEditId(String(row._id ?? ""));
    const res = EVAL_RECORD_RESULT.find((r) => r === String(row.result ?? "")) ?? EVAL_RECORD_RESULT[0];
    const st = EVAL_RECORD_STATUS.find((x) => x === String(row.status ?? "")) ?? EVAL_RECORD_STATUS[0];
    editForm.setFieldsValue({ action_description: String(row.action_description ?? ""), result: res, status: st, duration_seconds: Math.max(0, Math.floor(Number(row.duration_seconds) || 0)), video_url: row.video_url ? String(row.video_url) : "" });
    const rowScores = row.step_scores as StepScoreItem[] | undefined;
    const scores: Record<string, number> = {}; const retries: Record<string, number> = {}; const states: Record<string, null> = {};
    for (const s of taskSteps) { const found = Array.isArray(rowScores) ? rowScores.find((x) => x?.step_id === s.id) : undefined; scores[s.id] = found != null ? Number(found.score) : 0; retries[s.id] = 0; states[s.id] = null; }
    setEditStepScoreMap(scores); setEditStepRetryMap(retries); setEditStepStateMap(states); setEditVideoTouched(false); setEditDlg(true);
  }

  async function onEditUploadFile(file: File) {
    const fd = new FormData(); fd.append("file", file);
    const { data } = await http.post(`/api/evaluations/tasks/${taskId}/records/upload-video`, fd, { headers: { "Content-Type": "multipart/form-data" } });
    const dur = await estimateDuration(file);
    editForm.setFieldsValue({ video_url: (data as { video_url: string }).video_url, duration_seconds: dur });
    setEditVideoTouched(true); message.success("已更新视频");
    return false;
  }

  async function saveEditRecord() {
    if (!editId) return;
    setEditSaving(true);
    try {
      const vals = await editForm.validateFields();
      const body: Record<string, unknown> = { action_description: vals.action_description, result: vals.result, status: vals.status, duration_seconds: Math.max(0, Math.floor(Number(vals.duration_seconds) || 0)) };
      if (editVideoTouched && vals.video_url) body.video_url = vals.video_url;
      if (hasTaskSteps) body.step_scores = taskSteps.map((st) => ({ step_id: st.id, score: Number(editStepScoreMap[st.id] ?? 0) }));
      await http.put(`/api/evaluations/records/${editId}`, body);
      message.success("已保存"); setEditDlg(false); await loadRecords();
    } finally { setEditSaving(false); }
  }

  function delRecord(row: Row) {
    Modal.confirm({ title: "删除该评测记录？", okType: "danger", onOk: async () => {
      await http.delete(`/api/evaluations/records/${row._id}`); message.success("已删除"); await loadRecords();
    }});
  }

  // ── step detail ───────────────────────────────────────────────────────────
  function openStepDetail(row: Row) {
    const raw = (row.step_scores as StepScoreItem[] | undefined) || [];
    const byId = new Map<string, number>();
    for (const s of raw) { const sid = String(s?.step_id ?? ""); if (sid) byId.set(sid, Number(s?.score ?? 0)); }
    const built: RecordStepDetail[] = taskSteps.length > 0
      ? taskSteps.map((st, i) => ({ step_index: i + 1, step_id: st.id, step_name: st.name, max_score: Number(st.max_score) || 0, score: Number(byId.get(st.id) ?? 0) }))
      : raw.map((s, i) => ({ step_index: i + 1, step_id: String(s?.step_id ?? ""), step_name: String(s?.step_id ?? ""), max_score: 0, score: Number(s?.score ?? 0) }));
    setStepDetailItems(built); setStepDetailDlg(true);
  }

  // ── lifecycle ─────────────────────────────────────────────────────────────
  useEffect(() => { void refreshVideoDevices(); return () => { stopCam(); }; }, []);

  // persist camera selection
  useEffect(() => {
    try { if (selectedCameraId) localStorage.setItem(PREF_CAMERA_KEY, selectedCameraId); else localStorage.removeItem(PREF_CAMERA_KEY); } catch { /* ignore */ }
  }, [selectedCameraId]);

  // ── pagination & columns ──────────────────────────────────────────────────
  const pagination: TablePaginationConfig = {
    current: recPage, pageSize: recPageSize, total: recTotal, pageSizeOptions: [10, 20, 50, 100], showSizeChanger: true,
    showTotal: (t) => `共 ${t} 条`,
    onChange: (p, ps) => { if (ps !== recPageSize) { setRecPageSize(ps); setRecPage(1); } else setRecPage(p); },
  };

  const columns = [
    { title: "序号", width: 72, align: "center" as const, render: (_: unknown, __: unknown, i: number) => reverseSerialIndex(recTotal, recSkip, i) },
    { title: "评测记录ID", dataIndex: "_id", width: 200, ellipsis: true },
    { title: "动作描述", dataIndex: "action_description", render: (v: string) => <span style={{ whiteSpace: "pre-wrap" }}>{v}</span> },
    { title: "结果", dataIndex: "result", width: 90 },
    { title: "状态", width: 90, align: "center" as const, render: (_: unknown, row: Row) => {
      const s = String(row.status ?? "有效");
      return <Tag color={s === "剔除" ? "default" : "success"}>{s}</Tag>;
    }},
    { title: "时长(S)", dataIndex: "duration_seconds", width: 90 },
    { title: "步骤总分", width: 90, align: "right" as const, render: (_: unknown, row: Row) => row.total_score != null ? String(row.total_score) : "—" },
    { title: "步骤详情", width: 90, align: "center" as const, render: (_: unknown, row: Row) => {
      const has = Array.isArray(row.step_scores) && (row.step_scores as unknown[]).length > 0;
      return <Button type="link" disabled={!has} onClick={() => openStepDetail(row)}>查看</Button>;
    }},
    { title: "创建时间", width: 180, render: (_: unknown, row: Row) => formatDateTime(row.created_at) },
    { title: "视频", width: 120, render: (_: unknown, row: Row) => row.video_url ? (
      <Button type="link" onClick={() => { setPreviewVideoUrl(resolveMediaUrl(String(row.video_url))); setPreviewVideoDlg(true); }}>预览视频</Button>
    ) : "—" },
    ...(canWrite ? [{ title: "操作", width: 120, fixed: "right" as const, render: (_: unknown, row: Row) => (
      <><Button type="link" onClick={() => openEditRecord(row)}>编辑</Button><Button type="link" danger onClick={() => delRecord(row)}>删除</Button></>
    )}] : []),
  ];

  const stepDetailColumns = [
    { title: "第几步", dataIndex: "step_index", width: 80, align: "center" as const },
    { title: "步骤ID", dataIndex: "step_id", width: 120 },
    { title: "步骤名称", dataIndex: "step_name", ellipsis: true },
    { title: "满分", dataIndex: "max_score", width: 80, align: "right" as const },
    { title: "得分", dataIndex: "score", width: 80, align: "right" as const },
  ];

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <Card title={
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <Button type="link" style={{ padding: 0 }} onClick={() => navigate("/evaluations")}>← 返回</Button>
        <span style={{ fontWeight: 600, fontSize: 15 }}>评测录入 — 任务 <code style={{ fontFamily: "monospace", fontSize: 12, background: "rgba(15,23,42,0.06)", padding: "2px 6px", borderRadius: 4 }}>{taskId}</code></span>
      </div>
    }>
      <Divider>录入评测记录</Divider>

      {/* entry form */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 24, marginBottom: 24 }}>
        {/* left: camera */}
        <div style={{ flex: "1 1 300px", minWidth: 0 }}>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontWeight: 500, marginBottom: 8 }}>动作视频录制</div>
            <div style={{ position: "relative", width: "fit-content", maxWidth: "100%" }}>
              {camOn
                ? <video ref={videoRef} autoPlay muted playsInline style={{ display: "block", width: "min(420px,100%)", maxHeight: 248, background: "#1a1a1a", borderRadius: 8, objectFit: "cover" }} />
                : <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "min(420px,100%)", minHeight: 180, maxHeight: 248, color: "#8c8c8c", fontSize: 14, border: "1px dashed #d9d9d9", borderRadius: 8 }}>监控画面：请先开启摄像头</div>
              }
              {recording && <div style={{ position: "absolute", top: 8, left: 8, background: "rgba(245,108,108,0.95)", color: "#fff", padding: "4px 10px", borderRadius: 4, fontSize: 12 }}>● 录制中</div>}
            </div>
          </div>

          {videoDevices.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontWeight: 500, marginBottom: 6 }}>选择摄像头</div>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <Select
                  value={selectedCameraId}
                  onChange={(v) => { setSelectedCameraId(v ?? ""); setResolutionOptions([]); setSelectedResolution(""); }}
                  placeholder="选择摄像头" allowClear showSearch disabled={camOn || recording}
                  style={{ width: "min(360px,100%)" }}
                  options={[{ value: "", label: "系统默认（浏览器自行选择）" }, ...videoDevices.map((d) => ({ value: d.deviceId, label: d.label }))]}
                />
                <Button type="link" disabled={camOn || recording} onClick={refreshVideoDevices}>刷新设备列表</Button>
              </div>
            </div>
          )}

          {!camOn && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontWeight: 500, marginBottom: 6 }}>录制分辨率</div>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <Select
                  value={selectedResolution || undefined}
                  onChange={(v) => { setSelectedResolution(v ?? ""); try { localStorage.setItem(PREF_RESOLUTION_KEY, v ?? ""); } catch { /* ignore */ } }}
                  placeholder={resolutionOptions.length === 0 ? "请先检测分辨率" : "选择分辨率"}
                  disabled={recording || resolutionOptions.length === 0}
                  style={{ width: 220 }}
                  options={resolutionOptions.map((o) => ({ value: o.value, label: o.label }))}
                />
                <Button
                  type="link"
                  loading={probingRes}
                  disabled={camOn || recording}
                  onClick={handleProbeResolutions}
                >
                  {probingRes ? "检测中…" : resolutionOptions.length > 0 ? "重新检测" : "检测分辨率"}
                </Button>
              </div>
              {resolutionOptions.length === 0 && !probingRes && (
                <div style={{ marginTop: 4, fontSize: 12, color: "#8c8c8c" }}>点击「检测分辨率」探测摄像头支持的分辨率，默认使用最高分辨率。</div>
              )}
            </div>
          )}

          {camOn && actualResolution && (
            <div style={{ marginBottom: 12, fontSize: 12, color: "#595959" }}>
              实际分辨率：<span style={{ fontWeight: 600, color: "#1677ff" }}>{actualResolution}</span>
            </div>
          )}

          <div style={{ marginBottom: 12 }}>
            <div style={{ fontWeight: 500, marginBottom: 6 }}>开启摄像头</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "nowrap", overflowX: "auto" }}>
              {!camOn
                ? <Button type="primary" onClick={startCam}>开启摄像头</Button>
                : <>
                    <Button type="primary" disabled={recording} onClick={startRec}>开始</Button>
                    <Button type="primary" disabled={!recording} loading={uploadingRec} onClick={stopRecSave}>保存</Button>
                    <Button disabled={!recording} onClick={abortRec}>放弃</Button>
                    {!recording && <Button onClick={stopCam}>关闭</Button>}
                  </>
              }
            </div>
            <p style={{ margin: "6px 0 0", fontSize: 12, color: "#8c8c8c" }}>开启摄像头后可「开始」；录制中可「保存」上传，或「放弃」丢弃本次片段。</p>
            {showCamHttpHint && <div style={{ marginTop: 8, fontSize: 12, color: "#92400e", background: "rgba(245,158,11,0.12)", padding: "10px 12px", borderRadius: 8, border: "1px solid rgba(245,158,11,0.35)" }}>通过「局域网 IP + http」访问时，多数浏览器会禁止摄像头；请改用 <strong>localhost</strong> 或 <strong>https</strong>，或直接使用「上传 mp4」。</div>}
            {uploadedUrl && <div style={{ marginTop: 6, fontSize: 12, color: "#8c8c8c" }}>已上传：{uploadedUrl}</div>}
          </div>

          <div>
            <div style={{ fontWeight: 500, marginBottom: 6 }}>或上传 mp4</div>
            <Upload accept="video/mp4,video/webm" beforeUpload={onUploadFile} showUploadList={false}><Button>选择文件上传</Button></Upload>
          </div>
        </div>

        {/* middle: form fields */}
        <div style={{ flex: "1 1 260px", minWidth: 0, display: "flex", flexDirection: "column" }}>
          <div style={{ flex: 1 }}>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontWeight: 500, marginBottom: 6 }}>动作执行描述</div>
              <Input.TextArea rows={6} value={actionDesc} onChange={(e) => setActionDesc(e.target.value)} />
            </div>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontWeight: 500, marginBottom: 6 }}>执行结果 <span style={{ color: "#ff4d4f" }}>*</span></div>
              <Select value={result} onChange={setResult} style={{ width: "min(240px,100%)" }} options={EVAL_RECORD_RESULT.map((r) => ({ value: r, label: r }))} />
            </div>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontWeight: 500, marginBottom: 6 }}>记录状态</div>
              <Select value={recordStatus} onChange={setRecordStatus} style={{ width: "min(240px,100%)" }} options={EVAL_RECORD_STATUS.map((s) => ({ value: s, label: s }))} />
            </div>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontWeight: 500, marginBottom: 6 }}>执行时间</div>
              <Input value={`${durationSeconds}S`} readOnly placeholder="0S（保存或上传后按视频时长换算）" style={{ width: "min(240px,100%)" }} />
            </div>
          </div>
          <div style={{ marginTop: "auto", paddingTop: 8 }}>
            <Button type="primary" loading={saving} onClick={submitRecord}>提交评测记录</Button>
          </div>
        </div>

        {/* right: step scoring */}
        {hasTaskSteps && (
          <div style={{ flex: "1 1 300px", minWidth: 0 }}>
            <div style={{ borderRadius: 12, border: "1px solid #e8edf3", background: "#fff", overflow: "hidden" }}>
              {/* header */}
              <div style={{ padding: "12px 16px", background: "linear-gradient(135deg,#f0f5ff 0%,#f8fafc 100%)", borderBottom: "1px solid #e8edf3", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: "#1e293b" }}>评测步骤打分</div>
                  <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>点击按钮快速打分，或手动输入</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 11, color: "#94a3b8" }}>总分</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: stepTotal > 0 ? "#3b82f6" : "#cbd5e1", lineHeight: 1.2 }}>{stepTotal}</div>
                </div>
              </div>
              {/* steps */}
              <div style={{ padding: "8px 12px" }}>
                {taskSteps.map((st, idx) => {
                  const state = stepStateMap[st.id] ?? null;
                  const retryCount = stepRetryMap[st.id] ?? 0;
                  const score = stepScoreMap[st.id] ?? 0;
                  const pct = st.max_score > 0 ? Math.min(100, Math.round((score / st.max_score) * 100)) : 0;
                  const barColor = state === "success" ? "#22c55e" : state === "fail" ? "#ef4444" : state === "retry" ? "#f59e0b" : "#e2e8f0";
                  return (
                    <div key={st.id} style={{ padding: "10px 0", borderBottom: idx < taskSteps.length - 1 ? "1px solid #f1f5f9" : "none" }}>
                      {/* step header */}
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                        <span style={{ flexShrink: 0, width: 22, height: 22, borderRadius: "50%", background: "#eff6ff", color: "#3b82f6", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{idx + 1}</span>
                        <span style={{ fontWeight: 600, fontSize: 13, color: "#1e293b", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{st.name}</span>
                        <span style={{ flexShrink: 0, fontSize: 12, color: "#94a3b8" }}>满分 <strong style={{ color: "#475569" }}>{st.max_score}</strong></span>
                      </div>
                      {/* score bar */}
                      <div style={{ height: 4, borderRadius: 2, background: "#f1f5f9", marginBottom: 8, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${pct}%`, background: barColor, borderRadius: 2, transition: "width 0.25s, background 0.2s" }} />
                      </div>
                      {/* controls */}
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        <InputNumber
                          value={score} min={0} max={st.max_score} precision={2}
                          onChange={(v) => { setStepScoreMap((p) => ({ ...p, [st.id]: v ?? 0 })); setStepStateMap((p) => ({ ...p, [st.id]: null })); }}
                          style={{ width: 80 }} size="small"
                        />
                        <Tooltip title="成功（满分）">
                          <Button
                            size="small" shape="round"
                            icon={<CheckCircleFilled />}
                            style={{ color: state === "success" ? "#fff" : "#22c55e", background: state === "success" ? "#22c55e" : "transparent", borderColor: "#22c55e", fontWeight: 600, fontSize: 12, padding: "0 10px" }}
                            onClick={() => markStep(st.id, st.max_score, "success", setStepScoreMap, setStepRetryMap, setStepStateMap, st.retry_ratios)}
                          >成功</Button>
                        </Tooltip>
                        <Tooltip title={retryCount < (st.retry_ratios?.length ?? 3) ? `第${retryCount + 1}次重试（×${(st.retry_ratios?.[retryCount] ?? [0.8, 0.5, 0][retryCount])}）` : "再次点击重置"}>
                          <Button
                            size="small" shape="round"
                            icon={<ReloadOutlined />}
                            style={{ color: state === "retry" ? "#fff" : "#f59e0b", background: state === "retry" ? "#f59e0b" : "transparent", borderColor: "#f59e0b", fontWeight: 600, fontSize: 12, padding: "0 10px" }}
                            onClick={() => markStep(st.id, st.max_score, "retry", setStepScoreMap, setStepRetryMap, setStepStateMap, st.retry_ratios)}
                          >{retryCount > 0 ? `重试${retryCount}` : "重试"}</Button>
                        </Tooltip>
                        <Tooltip title="失败（0分）">
                          <Button
                            size="small" shape="round"
                            icon={<CloseCircleFilled />}
                            style={{ color: state === "fail" ? "#fff" : "#ef4444", background: state === "fail" ? "#ef4444" : "transparent", borderColor: "#ef4444", fontWeight: 600, fontSize: 12, padding: "0 10px" }}
                            onClick={() => markStep(st.id, st.max_score, "fail", setStepScoreMap, setStepRetryMap, setStepStateMap, st.retry_ratios)}
                          >失败</Button>
                        </Tooltip>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      <Divider>评测记录</Divider>
      <Table rowKey="_id" dataSource={records} columns={columns} pagination={pagination} bordered size="small" scroll={{ x: "max-content" }} />

      {/* edit record dialog */}
      <Modal title="编辑评测记录" open={editDlg} onOk={saveEditRecord} confirmLoading={editSaving} onCancel={() => setEditDlg(false)} width={560} afterClose={() => { editForm.resetFields(); setEditId(null); setEditVideoTouched(false); }}>
        <Form form={editForm} labelCol={{ span: 7 }}>
          <Form.Item label="评测记录ID"><Input value={editId ?? ""} readOnly /></Form.Item>
          <Form.Item label="动作执行描述" name="action_description"><Input.TextArea rows={4} /></Form.Item>
          <Form.Item label="动作执行结果" name="result" rules={[{ required: true }]}><Select style={{ width: 200 }} options={EVAL_RECORD_RESULT.map((r) => ({ value: r, label: r }))} /></Form.Item>
          <Form.Item label="状态" name="status" rules={[{ required: true }]}><Select style={{ width: 200 }} options={EVAL_RECORD_STATUS.map((s) => ({ value: s, label: s }))} /></Form.Item>
          <Form.Item label="时长(S)" name="duration_seconds"><InputNumber min={0} step={1} /></Form.Item>
          {hasTaskSteps && (
            <>
              <Divider>评测步骤得分</Divider>
              {taskSteps.map((st, idx) => {
                const state = editStepStateMap[st.id] ?? null;
                const retryCount = editStepRetryMap[st.id] ?? 0;
                const score = editStepScoreMap[st.id] ?? 0;
                const pct = st.max_score > 0 ? Math.min(100, Math.round((score / st.max_score) * 100)) : 0;
                const barColor = state === "success" ? "#22c55e" : state === "fail" ? "#ef4444" : state === "retry" ? "#f59e0b" : "#e2e8f0";
                return (
                  <div key={st.id} style={{ marginBottom: 12, padding: "10px 12px", borderRadius: 8, border: "1px solid #f1f5f9", background: "#fafbfc" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                      <span style={{ flexShrink: 0, width: 20, height: 20, borderRadius: "50%", background: "#eff6ff", color: "#3b82f6", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{idx + 1}</span>
                      <span style={{ fontWeight: 600, fontSize: 13, color: "#1e293b", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{st.name}</span>
                      <span style={{ flexShrink: 0, fontSize: 12, color: "#94a3b8" }}>满分 <strong style={{ color: "#475569" }}>{st.max_score}</strong></span>
                    </div>
                    <div style={{ height: 3, borderRadius: 2, background: "#f1f5f9", marginBottom: 8, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${pct}%`, background: barColor, borderRadius: 2, transition: "width 0.25s, background 0.2s" }} />
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      <InputNumber value={score} min={0} max={st.max_score} precision={2} onChange={(v) => { setEditStepScoreMap((p) => ({ ...p, [st.id]: v ?? 0 })); setEditStepStateMap((p) => ({ ...p, [st.id]: null })); }} style={{ width: 80 }} size="small" />
                      <Tooltip title="成功（满分）">
                        <Button size="small" shape="round" icon={<CheckCircleFilled />}
                          style={{ color: state === "success" ? "#fff" : "#22c55e", background: state === "success" ? "#22c55e" : "transparent", borderColor: "#22c55e", fontWeight: 600, fontSize: 12, padding: "0 10px" }}
                          onClick={() => markStep(st.id, st.max_score, "success", setEditStepScoreMap, setEditStepRetryMap, setEditStepStateMap, st.retry_ratios)}>成功</Button>
                      </Tooltip>
                      <Tooltip title={retryCount < (st.retry_ratios?.length ?? 3) ? `第${retryCount + 1}次重试（×${(st.retry_ratios?.[retryCount] ?? [0.8, 0.5, 0][retryCount])}）` : "再次点击重置"}>
                        <Button size="small" shape="round" icon={<ReloadOutlined />}
                          style={{ color: state === "retry" ? "#fff" : "#f59e0b", background: state === "retry" ? "#f59e0b" : "transparent", borderColor: "#f59e0b", fontWeight: 600, fontSize: 12, padding: "0 10px" }}
                          onClick={() => markStep(st.id, st.max_score, "retry", setEditStepScoreMap, setEditStepRetryMap, setEditStepStateMap, st.retry_ratios)}>{retryCount > 0 ? `重试${retryCount}` : "重试"}</Button>
                      </Tooltip>
                      <Tooltip title="失败（0分）">
                        <Button size="small" shape="round" icon={<CloseCircleFilled />}
                          style={{ color: state === "fail" ? "#fff" : "#ef4444", background: state === "fail" ? "#ef4444" : "transparent", borderColor: "#ef4444", fontWeight: 600, fontSize: 12, padding: "0 10px" }}
                          onClick={() => markStep(st.id, st.max_score, "fail", setEditStepScoreMap, setEditStepRetryMap, setEditStepStateMap, st.retry_ratios)}>失败</Button>
                      </Tooltip>
                    </div>
                  </div>
                );
              })}
            </>
          )}
          <Form.Item label="重传视频">
            <Upload accept="video/mp4,video/webm" beforeUpload={onEditUploadFile} showUploadList={false}><Button>选择 mp4/webm</Button></Upload>
          </Form.Item>
          <Form.Item name="video_url" hidden><Input /></Form.Item>
        </Form>
      </Modal>

      {/* step detail dialog */}
      <Modal title="步骤详情" open={stepDetailDlg} onCancel={() => setStepDetailDlg(false)} footer={<Button onClick={() => setStepDetailDlg(false)}>关闭</Button>} width={680}>
        <Table rowKey="step_id" dataSource={stepDetailItems} columns={stepDetailColumns} pagination={false} bordered size="small" />
      </Modal>

      {/* video preview dialog */}
      <Modal title="视频预览" open={previewVideoDlg} onCancel={() => { setPreviewVideoDlg(false); setPreviewVideoUrl(""); }} footer={null} width="min(720px, 92vw)" destroyOnClose>
        {previewVideoUrl && <video key={previewVideoUrl} src={previewVideoUrl} style={{ width: "100%", maxHeight: "min(70vh, 520px)", borderRadius: 4, background: "#000", objectFit: "contain" }} controls playsInline preload="metadata" />}
      </Modal>
    </Card>
  );
}