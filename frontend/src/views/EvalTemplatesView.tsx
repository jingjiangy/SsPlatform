import { useEffect, useMemo, useState } from "react";
import { Table, Button, Modal, Form, Input, Select, InputNumber, Divider, message, Card, Space, Tooltip } from "antd";
import { InfoCircleOutlined } from "@ant-design/icons";
import type { TablePaginationConfig } from "antd";
import http from "@/api/http";
import { EVAL_TEMPLATE_STATUS } from "@/constants/options";
import { canWriteEvalTemplate } from "@/stores/auth";
import { formatDateTime } from "@/utils/datetime";
import { DEFAULT_PAGE_SIZE, reverseSerialIndex, skipForPage } from "@/utils/pagination";
import { useSearchParams } from "react-router-dom";

type Row = Record<string, unknown>;
type StepKV = { step_id: number; name: string; max_score: number };

const DEFAULT_RETRY_RATIOS: [number, number, number] = [0.8, 0.5, 0.0];

export default function EvalTemplatesView() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [items, setItems] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [dlg, setDlg] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [steps, setSteps] = useState<StepKV[]>([]);
  const [retryRatios, setRetryRatios] = useState<[number, number, number]>([...DEFAULT_RETRY_RATIOS]);
  const [form] = Form.useForm();
  const canWrite = canWriteEvalTemplate();
  const skip = useMemo(() => skipForPage(page, pageSize), [page, pageSize]);

  async function load() {
    const { data } = await http.get("/api/evaluations/step-templates", { params: { skip, limit: pageSize } });
    const list = (data.items || []) as Row[];
    const t = Number(data.total);
    if (list.length === 0 && t > 0 && page > 1) { setPage(1); return; }
    setItems(list); setTotal(Number.isFinite(t) ? t : 0);
  }

  useEffect(() => { void load(); }, [page, pageSize]);

  useEffect(() => {
    const openId = searchParams.get("open");
    if (!openId) return;
    setSearchParams({}, { replace: true });
    http.get(`/api/evaluations/step-templates/${openId}`).then(({ data }) => {
      openEdit(data as Row);
    }).catch(() => message.error("模板不存在或加载失败"));
  }, []);

  function rebalance(arr: StepKV[]): StepKV[] {
    const n = arr.length;
    if (n === 0) return arr;
    const unit = Number((100 / n).toFixed(2));
    let sum = 0;
    return arr.map((s, i) => {
      const score = i < n - 1 ? unit : Number((100 - sum).toFixed(2));
      sum += unit;
      return { ...s, step_id: i + 1, max_score: score };
    });
  }

  function addStep() { setSteps((prev) => rebalance([...prev, { step_id: 0, name: "", max_score: 0 }])); }
  function insertBefore(idx: number) { setSteps((prev) => { const next = [...prev]; next.splice(idx, 0, { step_id: 0, name: "", max_score: 0 }); return rebalance(next); }); }
  function removeStep(idx: number) { setSteps((prev) => rebalance(prev.filter((_, i) => i !== idx))); }
  function updateStep(idx: number, field: keyof StepKV, val: string | number) {
    setSteps((prev) => prev.map((s, i) => i === idx ? { ...s, [field]: val } : s));
  }

  function openCreate() {
    setEditingId(null);
    form.resetFields();
    form.setFieldsValue({ status: EVAL_TEMPLATE_STATUS[0] });
    setSteps([]);
    setRetryRatios([...DEFAULT_RETRY_RATIOS]);
    setDlg(true);
  }
  function openEdit(row: Row) {
    setEditingId(String(row._id));
    form.setFieldsValue({ name: row.name, description: row.description || "", status: row.status });
    const raw = row.steps as (StepKV & { retry_ratios?: unknown })[] | undefined;
    // read retry_ratios from first step (they're uniform)
    if (Array.isArray(raw) && raw.length > 0) {
      const first = raw[0];
      const rr = Array.isArray(first.retry_ratios) && first.retry_ratios.length === 3
        ? first.retry_ratios.map((r) => Number(r)) as [number, number, number]
        : [...DEFAULT_RETRY_RATIOS] as [number, number, number];
      setRetryRatios(rr);
    } else {
      setRetryRatios([...DEFAULT_RETRY_RATIOS]);
    }
    setSteps(Array.isArray(raw) ? raw.map((s, i) => ({
      step_id: i + 1,
      name: String(s.name ?? ""),
      max_score: Number(s.max_score) || 10,
    })) : []);
    setDlg(true);
  }

  async function save() {
    const vals = await form.validateFields();
    if (!vals.name?.trim()) { message.warning("请填写模板名称"); return; }
    const stepsWithRatios = steps
      .filter((s) => s.name && s.max_score > 0)
      .map((s) => ({ ...s, retry_ratios: retryRatios }));
    const body = { ...vals, steps: stepsWithRatios };
    if (editingId) await http.put(`/api/evaluations/step-templates/${editingId}`, body);
    else await http.post("/api/evaluations/step-templates", body);
    setDlg(false); message.success("已保存"); await load();
  }

  async function removeRow(row: Row) {
    Modal.confirm({ title: "确定删除该评测模板？", okType: "danger", onOk: async () => {
      try {
        await http.delete(`/api/evaluations/step-templates/${row._id}`);
        message.success("已删除"); await load();
      } catch (e: unknown) {
        const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
        if (msg) Modal.warning({ title: "无法删除", content: msg });
      }
    }});
  }

  function stepsSummary(row: Row) {
    const raw = row.steps as { step_id?: unknown; name?: unknown; max_score?: unknown }[] | undefined;
    if (!Array.isArray(raw) || !raw.length) return "—";
    return raw.map((s) => `${s.step_id}.${s.name}:${s.max_score}`).filter((x) => x !== ":").join("；");
  }

  const pagination: TablePaginationConfig = {
    current: page, pageSize, total, pageSizeOptions: [10, 20, 50, 100], showSizeChanger: true,
    showTotal: (t) => `共 ${t} 条`,
    onChange: (p, ps) => { if (ps !== pageSize) { setPageSize(ps); setPage(1); } else setPage(p); },
  };

  const columns = [
    { title: "序号", width: 72, align: "center" as const, render: (_: unknown, __: unknown, i: number) => reverseSerialIndex(total, skip, i) },
    { title: "模板ID", dataIndex: "_id", width: 220, ellipsis: true },
    { title: "模板名称", dataIndex: "name", width: 160, ellipsis: true },
    { title: "模板描述", dataIndex: "description", render: (v: string) => <span style={{ whiteSpace: "pre-wrap" }}>{v}</span> },
    { title: "状态", dataIndex: "status", width: 100 },
    { title: "步骤(k:v)", ellipsis: true, render: (_: unknown, row: Row) => stepsSummary(row) },
    { title: "创建时间", width: 180, render: (_: unknown, row: Row) => formatDateTime(row.created_at) },
    { title: "更新时间", width: 180, render: (_: unknown, row: Row) => formatDateTime(row.updated_at) },
    ...(canWrite ? [{ title: "操作", width: 140, fixed: "right" as const, render: (_: unknown, row: Row) => (<><Button type="link" onClick={() => openEdit(row)}>编辑</Button><Button type="link" danger onClick={() => removeRow(row)}>删除</Button></>) }] : []),
  ];

  return (
    <Card title={<div style={{ display: "flex", justifyContent: "space-between" }}><span>世界模型素材库 / 评测模板</span>{canWrite && <Button type="primary" onClick={openCreate}>新建模板</Button>}</div>}>
      <Table rowKey="_id" dataSource={items} columns={columns} pagination={pagination} bordered size="small" scroll={{ x: "max-content" }} />
      <Modal title={editingId ? "编辑评测模板" : "新建评测模板"} open={dlg} onOk={save} onCancel={() => setDlg(false)} width={760} afterClose={() => form.resetFields()}>
        <Form form={form} labelCol={{ span: 5 }}>
          <Form.Item label="模板名称" name="name" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item label="模板描述" name="description"><Input.TextArea rows={3} /></Form.Item>
          <Form.Item label="模板状态" name="status" rules={[{ required: true }]}><Select style={{ width: 220 }} options={EVAL_TEMPLATE_STATUS.map((s) => ({ value: s, label: s }))} /></Form.Item>
          <Form.Item
            label={
              <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                重试扣分倍率
                <Tooltip title="依次对应第1/2/3次重试的得分比例（0~1），例如 0.8 表示得满分×0.8">
                  <InfoCircleOutlined style={{ color: "#bbb", cursor: "help" }} />
                </Tooltip>
              </span>
            }
          >
            <Space size={4}>
              {([0, 1, 2] as const).map((pos) => (
                <Tooltip key={pos} title={`第${pos + 1}次重试倍率`}>
                  <InputNumber
                    value={retryRatios[pos]}
                    min={0} max={1} step={0.1} precision={2}
                    onChange={(v) => setRetryRatios((prev) => { const next = [...prev] as [number, number, number]; next[pos] = v ?? 0; return next; })}
                    style={{ width: 80 }}
                  />
                </Tooltip>
              ))}
            </Space>
          </Form.Item>
        </Form>
        <Divider>步骤键值对（k=步骤名称，v=步骤分值）</Divider>
        <div style={{ display: "grid", gridTemplateColumns: "56px 1fr 100px 100px", gap: 8, fontSize: 12, color: "#8c8c8c", marginBottom: 6, padding: "0 4px" }}>
          <span>步骤ID</span>
          <span>步骤名称</span>
          <span>满分</span>
          <span>操作</span>
        </div>
        {steps.map((s, idx) => (
          <div key={idx} style={{ display: "grid", gridTemplateColumns: "56px 1fr 100px 100px", gap: 8, alignItems: "center", marginBottom: 8 }}>
            <Input value={String(s.step_id)} readOnly style={{ textAlign: "center" }} />
            <Input value={s.name} onChange={(e) => updateStep(idx, "name", e.target.value)} placeholder="步骤名称" />
            <InputNumber value={s.max_score} min={0.01} max={1000000} precision={2} onChange={(v) => updateStep(idx, "max_score", v ?? 0)} style={{ width: "100%" }} />
            <Space size={4}>
              <Button type="link" size="small" onClick={() => insertBefore(idx)} title="在此步之前插入">+</Button>
              <Button type="link" size="small" danger onClick={() => removeStep(idx)}>删除</Button>
            </Space>
          </div>
        ))}
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 8 }}>
          <Button onClick={addStep}>添加步骤</Button>
          <span style={{ color: "#8c8c8c", fontSize: 12 }}>总分固定 100，新增/删除步骤时自动均分</span>
        </div>
      </Modal>
    </Card>
  );
}
