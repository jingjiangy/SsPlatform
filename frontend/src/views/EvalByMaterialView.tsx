import { useEffect, useMemo, useState } from "react";
import { Table, Button, Modal, Form, Input, Select, message, Card } from "antd";
import type { TablePaginationConfig } from "antd";
import { useSearchParams, useNavigate } from "react-router-dom";
import http from "@/api/http";
import { EVAL_TASK_TYPES, EVAL_TASK_STATUS } from "@/constants/options";
import { canWriteMaterial } from "@/stores/auth";
import { formatDateTime } from "@/utils/datetime";
import { DEFAULT_PAGE_SIZE, reverseSerialIndex, skipForPage } from "@/utils/pagination";

type Row = Record<string, unknown>;
type StepTemplate = { _id: string; name: string };

export default function EvalByMaterialView() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const materialId = searchParams.get("materialId") || "";
  const materialName = searchParams.get("materialName") || "";
  const [items, setItems] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [addDlg, setAddDlg] = useState(false);
  const [dlg, setDlg] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [stepTemplates, setStepTemplates] = useState<StepTemplate[]>([]);
  const [addForm] = Form.useForm();
  const [editForm] = Form.useForm();
  const canWrite = canWriteMaterial();
  const skip = useMemo(() => skipForPage(page, pageSize), [page, pageSize]);

  async function load() {
    if (!materialId) return;
    const { data } = await http.get("/api/evaluations/tasks", { params: { material_id: materialId, skip, limit: pageSize } });
    const list = (data.items || []) as Row[];
    const t = Number(data.total);
    if (list.length === 0 && t > 0 && page > 1) { setPage(1); return; }
    setItems(list); setTotal(Number.isFinite(t) ? t : 0);
  }

  async function loadTemplates() {
    const { data } = await http.get("/api/evaluations/step-templates", { params: { limit: 200 } });
    setStepTemplates(((data.items || []) as Row[]).map((x) => ({ _id: String(x._id), name: String(x.name || "") })));
  }

  useEffect(() => { void load(); }, [page, pageSize, materialId]);

  function openCreate() {
    addForm.resetFields();
    addForm.setFieldsValue({ description: materialName ? `关联素材 ${materialName}` : "" });
    void loadTemplates(); setAddDlg(true);
  }

  async function submitCreate() {
    const vals = await addForm.validateFields();
    const { data } = await http.post<{ version?: string }>("/api/evaluations/tasks", {
      description: vals.description, task_type: EVAL_TASK_TYPES[0], status: EVAL_TASK_STATUS[2],
      material_id: materialId, material_name: materialName, template_id: vals.template_id || undefined,
    });
    setAddDlg(false);
    const ver = data.version ? String(data.version) : "";
    message.success(ver ? `已创建评测任务，任务版本 ${ver}` : "已创建评测任务");
    await load();
  }

  function openEdit(row: Row) {
    setEditingId(String(row._id));
    editForm.setFieldsValue({ description: row.description || "", task_type: row.task_type, status: row.status });
    setDlg(true);
  }

  async function save() {
    if (!editingId) return;
    const vals = await editForm.validateFields();
    await http.put(`/api/evaluations/tasks/${editingId}`, { description: vals.description, task_type: vals.task_type, status: vals.status });
    setDlg(false); message.success("已保存"); await load();
  }

  async function removeTask(row: Row) {
    Modal.confirm({ title: "确定删除该评测任务及其录入记录？", okType: "danger", onOk: async () => {
      await http.delete(`/api/evaluations/tasks/${row._id}`); message.success("已删除"); await load();
    }});
  }

  const pagination: TablePaginationConfig = {
    current: page, pageSize, total, pageSizeOptions: [10, 20, 50, 100], showSizeChanger: true,
    showTotal: (t) => `共 ${t} 条`,
    onChange: (p, ps) => { if (ps !== pageSize) { setPageSize(ps); setPage(1); } else setPage(p); },
  };

  const columns = [
    { title: "序号", width: 72, align: "center" as const, render: (_: unknown, __: unknown, i: number) => reverseSerialIndex(total, skip, i) },
    { title: "任务ID", dataIndex: "_id", width: 200 },
    { title: "描述", dataIndex: "description" },
    { title: "类型", dataIndex: "task_type", width: 100 },
    { title: "状态", dataIndex: "status", width: 100 },
    { title: "评测任务版本", width: 120, render: (_: unknown, row: Row) => row.version != null && row.version !== "" ? String(row.version) : "—" },
    { title: "评测次数", width: 120, render: (_: unknown, row: Row) => `${row.success_count} / ${row.total_count}` },
    { title: "创建时间", width: 180, render: (_: unknown, row: Row) => formatDateTime(row.created_at) },
    { title: "更新时间", width: 180, render: (_: unknown, row: Row) => formatDateTime(row.updated_at) },
    { title: "操作", width: 240, fixed: "right" as const, render: (_: unknown, row: Row) => (
      <>
        <Button type="link" onClick={() => navigate(`/evaluations/${row._id}/detail`)}>执行评测</Button>
        {canWrite && <Button type="link" onClick={() => openEdit(row)}>编辑</Button>}
        {canWrite && <Button type="link" danger onClick={() => removeTask(row)}>删除</Button>}
      </>
    )},
  ];

  return (
    <Card title={
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <Button type="link" style={{ padding: 0, width: "fit-content" }} onClick={() => navigate("/materials")}>← 返回素材库</Button>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", gap: 24, fontWeight: 600 }}>
            <span>世界模型素材ID：{materialId}</span>
            <span>素材名称：{materialName}</span>
          </div>
          {canWrite && <Button type="primary" onClick={openCreate}>创建关联评测任务</Button>}
        </div>
      </div>
    }>
      {!items.length ? <p style={{ color: "#8c8c8c" }}>评测任务为空</p> : (
        <Table rowKey="_id" dataSource={items} columns={columns} pagination={pagination} bordered size="small" scroll={{ x: "max-content" }} />
      )}

      <Modal title="创建关联评测任务" open={addDlg} onOk={submitCreate} onCancel={() => setAddDlg(false)} afterClose={() => addForm.resetFields()}>
        <Form form={addForm} labelCol={{ span: 6 }}>
          <Form.Item label="评测任务描述" name="description" rules={[{ required: true }]}><Input.TextArea rows={4} /></Form.Item>
          <Form.Item label="关联评测模板" name="template_id">
            <Select options={stepTemplates.map((t) => ({ value: t._id, label: t.name }))} allowClear showSearch placeholder="可选，选择后自动带入模板步骤" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal title="修改评测任务" open={dlg} onOk={save} onCancel={() => setDlg(false)} afterClose={() => editForm.resetFields()}>
        <Form form={editForm} labelCol={{ span: 5 }}>
          <Form.Item label="描述" name="description"><Input.TextArea rows={4} /></Form.Item>
          <Form.Item label="类型" name="task_type" rules={[{ required: true }]}><Select options={EVAL_TASK_TYPES.map((t) => ({ value: t, label: t }))} /></Form.Item>
          <Form.Item label="状态" name="status" rules={[{ required: true }]}><Select options={EVAL_TASK_STATUS.map((s) => ({ value: s, label: s }))} /></Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}
