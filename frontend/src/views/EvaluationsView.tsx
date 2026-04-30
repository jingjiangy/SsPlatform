import { useEffect, useMemo, useState } from "react";
import { Table, Button, Modal, Form, Input, Select, InputNumber, Divider, message, Card, Space } from "antd";
import type { TablePaginationConfig } from "antd";
import http from "@/api/http";
import { EVAL_TASK_TYPES, EVAL_TASK_STATUS } from "@/constants/options";
import { canWriteMaterial } from "@/stores/auth";
import { formatDateTime } from "@/utils/datetime";
import { DEFAULT_PAGE_SIZE, reverseSerialIndex, skipForPage } from "@/utils/pagination";
import { translateZhToEnEval } from "@/utils/translateEval";
import { useNavigate } from "react-router-dom";

type Row = Record<string, unknown>;
type EvalStep = { id?: string; name: string; max_score: number };
type StepAvgItem = { step_id: string; step_name: string; max_score: number; avg_score: number };
type StepTemplate = { _id: string; name: string; steps: { name: string; max_score: number }[] };

export default function EvaluationsView() {
  const navigate = useNavigate();
  const [items, setItems] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [dlg, setDlg] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [steps, setSteps] = useState<EvalStep[]>([]);
  const [stepTemplates, setStepTemplates] = useState<StepTemplate[]>([]);
  const [selectedTplId, setSelectedTplId] = useState<string>("");
  const [stepAvgDlg, setStepAvgDlg] = useState(false);
  const [stepAvgItems, setStepAvgItems] = useState<StepAvgItem[]>([]);
  const [stepAvgTotal, setStepAvgTotal] = useState(0);
  const [stepAvgLoading, setStepAvgLoading] = useState(false);
  const [stepAvgEnglish, setStepAvgEnglish] = useState(false);
  const [stepAvgTranslating, setStepAvgTranslating] = useState(false);
  const [stepAvgNameEn, setStepAvgNameEn] = useState<Record<string, string>>({});
  const [form] = Form.useForm();
  const canWrite = canWriteMaterial();
  const skip = useMemo(() => skipForPage(page, pageSize), [page, pageSize]);

  async function load() {
    const { data } = await http.get("/api/evaluations/tasks", { params: { skip, limit: pageSize } });
    const list = (data.items || []) as Row[];
    const t = Number(data.total);
    if (list.length === 0 && t > 0 && page > 1) { setPage(1); return; }
    setItems(list); setTotal(Number.isFinite(t) ? t : 0);
  }

  useEffect(() => { void load(); }, [page, pageSize]);

  async function loadStepTemplates() {
    const { data } = await http.get("/api/evaluations/step-templates", { params: { limit: 100 } });
    setStepTemplates((data.items || []) as StepTemplate[]);
  }

  function addStep() { setSteps((p) => [...p, { name: "", max_score: 10 }]); }
  function insertBefore(idx: number) { setSteps((p) => { const n = [...p]; n.splice(idx, 0, { name: "", max_score: 10 }); return n; }); }
  function removeStep(idx: number) { setSteps((p) => p.filter((_, i) => i !== idx)); }
  function updateStep(idx: number, field: keyof EvalStep, val: string | number) {
    setSteps((p) => p.map((s, i) => i === idx ? { ...s, [field]: val } : s));
  }

  function applyTemplate() {
    const t = stepTemplates.find((x) => String(x._id) === selectedTplId);
    if (!t?.steps?.length) { message.warning("该模板无步骤"); return; }
    setSteps(t.steps.map((s) => ({ name: String(s.name ?? ""), max_score: Number(s.max_score) > 0 ? Number(s.max_score) : 10 })));
    message.success("已从模板载入步骤");
  }

  async function saveAsTemplate() {
    const trimmed = steps.filter((s) => s.name.trim() && s.max_score > 0).map((s) => ({ name: s.name.trim(), max_score: s.max_score }));
    if (!trimmed.length) { message.warning("请先添加有效步骤"); return; }
    const name = window.prompt("模板名称");
    if (!name?.trim()) return;
    await http.post("/api/evaluations/step-templates", { name: name.trim(), steps: trimmed });
    message.success("已保存模板"); await loadStepTemplates();
  }

  function openEdit(row: Row) {
    setEditingId(String(row._id));
    form.setFieldsValue({ description: row.description || "", task_type: row.task_type, status: row.status, version: row.version, material_id: row.material_id ? String(row.material_id) : "", material_name: row.material_name || "" });
    const raw = row.steps as unknown;
    if (Array.isArray(raw) && raw.length) {
      setSteps(raw.map((x: Record<string, unknown>) => ({ id: x.id ? String(x.id) : undefined, name: String(x.name ?? ""), max_score: Number(x.max_score) > 0 ? Number(x.max_score) : 10 })));
    } else { setSteps([]); }
    setSelectedTplId(""); void loadStepTemplates(); setDlg(true);
  }

  async function save() {
    if (!editingId) return;
    const vals = await form.validateFields();
    const stepsPayload = steps.filter((s) => s.name.trim() && s.max_score > 0).map((s) => ({ ...(s.id ? { id: s.id } : {}), name: s.name.trim(), max_score: s.max_score }));
    const body: Record<string, unknown> = { description: vals.description, task_type: vals.task_type, status: vals.status, material_name: vals.material_name || undefined, steps: stepsPayload };
    if (!vals.material_id) body.version = vals.version;
    await http.put(`/api/evaluations/tasks/${editingId}`, body);
    setDlg(false); message.success("已保存"); await load();
  }

  async function remove(row: Row) {
    Modal.confirm({ title: "确定删除该评测任务及下属录入？", okType: "danger", onOk: async () => {
      await http.delete(`/api/evaluations/tasks/${row._id}`); message.success("已删除"); await load();
    }});
  }

  async function openStepAvg(row: Row) {
    const tid = String(row._id || "");
    if (!tid) return;
    setStepAvgEnglish(false); setStepAvgNameEn({});
    setStepAvgTotal(Number(row.avg_total_score) || 0);
    setStepAvgLoading(true);
    try {
      const { data } = await http.get(`/api/evaluations/tasks/${tid}/step-avg`);
      setStepAvgItems(((data as { items?: unknown[] }).items || []) as StepAvgItem[]);
      setStepAvgDlg(true);
    } finally { setStepAvgLoading(false); }
  }

  async function toggleEnglish() {
    if (stepAvgEnglish) { setStepAvgEnglish(false); return; }
    setStepAvgTranslating(true);
    try {
      const map: Record<string, string> = { ...stepAvgNameEn };
      for (const row of stepAvgItems) {
        const sid = String(row.step_id ?? "");
        if (!sid || map[sid]) continue;
        map[sid] = await translateZhToEnEval(String(row.step_name ?? ""));
      }
      setStepAvgNameEn(map); setStepAvgEnglish(true);
    } catch { message.error("翻译失败"); } finally { setStepAvgTranslating(false); }
  }

  function goToMaterial(row: Row) {
    if (!row.material_id) return;
    if (row.material_parent_id) { navigate(`/materials/${row.material_parent_id}/versions`); return; }
    navigate(`/materials?expandMaterial=${row.material_id}`);
  }

  const pagination: TablePaginationConfig = {
    current: page, pageSize, total, pageSizeOptions: [10, 20, 50, 100], showSizeChanger: true,
    showTotal: (t) => `共 ${t} 条`,
    onChange: (p, ps) => { if (ps !== pageSize) { setPageSize(ps); setPage(1); } else setPage(p); },
  };

  const columns = [
    { title: "序号", width: 72, align: "center" as const, render: (_: unknown, __: unknown, i: number) => reverseSerialIndex(total, skip, i) },
    { title: "任务ID", dataIndex: "_id", width: 200 },
    { title: "描述", dataIndex: "description", ellipsis: true, minWidth: 160 },
    { title: "素材任务名称", width: 140, render: (_: unknown, row: Row) => row.material_id ? <Button type="link" style={{ padding: 0 }} onClick={() => goToMaterial(row)}>{String(row.material_name || row.material_id)}</Button> : <span>{String(row.material_name || "—")}</span> },
    { title: "素材版本号", width: 100, render: (_: unknown, row: Row) => String(row.material_version || "—") },
    { title: "类型", dataIndex: "task_type", width: 100 },
    { title: "状态", dataIndex: "status", width: 100 },
    { title: "版本", dataIndex: "version", width: 80 },
    { title: "成功/失败/总数", width: 140, render: (_: unknown, row: Row) => `${row.success_count} / ${Math.max(0, Number(row.total_count) - Number(row.success_count))} / ${row.total_count}` },
    { title: "成功率", width: 90, render: (_: unknown, row: Row) => `${row.success_rate}%` },
    { title: "平均视频时长", width: 120, render: (_: unknown, row: Row) => `${row.avg_video_seconds}S` },
    { title: "步骤总分", width: 100, align: "right" as const, render: (_: unknown, row: Row) => row.avg_total_score ?? 0 },
    { title: "步骤分详情", width: 120, align: "center" as const, render: (_: unknown, row: Row) => <Button type="link" disabled={!Array.isArray(row.steps) || !(row.steps as unknown[]).length} onClick={() => openStepAvg(row)}>查看</Button> },
    { title: "创建时间", width: 180, render: (_: unknown, row: Row) => formatDateTime(row.created_at) },
    { title: "更新时间", width: 180, render: (_: unknown, row: Row) => formatDateTime(row.updated_at) },
    { title: "评测管理", width: 100, fixed: "right" as const, render: (_: unknown, row: Row) => <Button type="link" onClick={() => navigate(`/evaluations/${row._id}/detail`)}>执行评测</Button> },
    ...(canWrite ? [{ title: "操作", width: 160, fixed: "right" as const, render: (_: unknown, row: Row) => (<><Button type="link" onClick={() => openEdit(row)}>编辑</Button><Button type="link" danger onClick={() => remove(row)}>删除</Button></>) }] : []),
  ];

  const stepAvgColumns = [
    { title: "ID", dataIndex: "step_id", width: 120 },
    { title: "Name", render: (_: unknown, row: StepAvgItem) => stepAvgEnglish && stepAvgNameEn[String(row.step_id)] ? stepAvgNameEn[String(row.step_id)] : row.step_name },
    { title: "Pts", dataIndex: "max_score", width: 100, align: "right" as const },
    { title: "Avg", dataIndex: "avg_score", width: 100, align: "right" as const },
  ];

  return (
    <Card title="评测任务">
      <Table rowKey="_id" dataSource={items} columns={columns} pagination={pagination} bordered size="small" scroll={{ x: "max-content" }} />

      <Modal title="修改评测任务" open={dlg} onOk={save} onCancel={() => setDlg(false)} width={720} afterClose={() => form.resetFields()}>
        <Form form={form} labelCol={{ span: 5 }}>
          <Form.Item label="描述" name="description"><Input.TextArea rows={4} /></Form.Item>
          <Form.Item label="类型" name="task_type" rules={[{ required: true }]}><Select options={EVAL_TASK_TYPES.map((t) => ({ value: t, label: t }))} /></Form.Item>
          <Form.Item label="状态" name="status" rules={[{ required: true }]}><Select options={EVAL_TASK_STATUS.map((s) => ({ value: s, label: s }))} /></Form.Item>
          <Form.Item label="版本号" name="version"><Input /></Form.Item>
          <Form.Item label="关联素材ID" name="material_id"><Input placeholder="可选" /></Form.Item>
          <Form.Item label="素材名称" name="material_name"><Input placeholder="可选" /></Form.Item>
        </Form>
        <Divider>评测步骤</Divider>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 12 }}>
          <Select value={selectedTplId} onChange={setSelectedTplId} placeholder="载入步骤模板" allowClear showSearch style={{ width: 260 }} options={stepTemplates.map((t) => ({ value: String(t._id), label: t.name }))} />
          <Button type="primary" ghost disabled={!selectedTplId} onClick={applyTemplate}>载入</Button>
          <Button onClick={saveAsTemplate}>保存为模板</Button>
          <Button onClick={addStep}>添加步骤</Button>
        </div>
        <div style={{ border: "1px solid #f0f0f0", borderRadius: 8, padding: "8px 12px 12px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 140px 120px", gap: 10, fontSize: 12, color: "#8c8c8c", marginBottom: 8 }}>
            <span>步骤名称</span><span>满分</span><span>操作</span>
          </div>
          {steps.map((s, idx) => (
            <div key={idx} style={{ display: "grid", gridTemplateColumns: "1fr 140px 120px", gap: 10, alignItems: "center", marginBottom: 8 }}>
              <Input value={s.name} onChange={(e) => updateStep(idx, "name", e.target.value)} placeholder="步骤名称" maxLength={256} />
              <InputNumber value={s.max_score} min={0.01} max={1000000} precision={2} onChange={(v) => updateStep(idx, "max_score", v ?? 0)} style={{ width: "100%" }} />
              <Space size={4}>
                <Button type="link" onClick={() => insertBefore(idx)} title="在此步之前插入">+</Button>
                <Button type="link" danger onClick={() => removeStep(idx)}>删除</Button>
              </Space>
            </div>
          ))}
          {!steps.length && <p style={{ color: "#8c8c8c", fontSize: 13, margin: "8px 4px 0" }}>未配置步骤时，录入页不显示「步骤打分」列。</p>}
        </div>
      </Modal>

      <Modal title="Avg. step total" open={stepAvgDlg} onCancel={() => { setStepAvgDlg(false); setStepAvgEnglish(false); setStepAvgNameEn({}); }} footer={null} width={700}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
          <p style={{ margin: 0 }}>Avg. step total: <strong>{stepAvgTotal}</strong></p>
          <Button size="small" loading={stepAvgTranslating} onClick={toggleEnglish}>{stepAvgEnglish ? "Chinese" : "To English"}</Button>
        </div>
        <Table rowKey="step_id" dataSource={stepAvgItems} columns={stepAvgColumns} loading={stepAvgLoading} pagination={false} bordered size="small" />
      </Modal>
    </Card>
  );
}
