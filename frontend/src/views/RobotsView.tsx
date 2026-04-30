import { useEffect, useMemo, useState } from "react";
import { Table, Button, Modal, Form, Input, Select, message, Card } from "antd";
import type { TablePaginationConfig } from "antd";
import http from "@/api/http";
import { ROBOT_STATUS } from "@/constants/options";
import { canWriteRobot } from "@/stores/auth";
import { formatDateTime } from "@/utils/datetime";
import { DEFAULT_PAGE_SIZE, reverseSerialIndex, skipForPage } from "@/utils/pagination";

type Row = Record<string, unknown>;
type DeviceModelOption = { id: string; name: string; status: string };

export default function RobotsView() {
  const [items, setItems] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [formDlg, setFormDlg] = useState(false);
  const [detailDlg, setDetailDlg] = useState(false);
  const [mode, setMode] = useState<"add" | "edit">("add");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [detailSaving, setDetailSaving] = useState(false);
  const [deviceModelOptions, setDeviceModelOptions] = useState<DeviceModelOption[]>([]);
  const [form] = Form.useForm();
  const [detailForm] = Form.useForm();
  const canWrite = canWriteRobot();
  const skip = useMemo(() => skipForPage(page, pageSize), [page, pageSize]);

  async function loadDeviceModelOptions() {
    try {
      const { data } = await http.get("/api/robots/device-model-options");
      setDeviceModelOptions((data.items || []) as DeviceModelOption[]);
    } catch { setDeviceModelOptions([]); }
  }

  function resolveDeviceModelId(row: Row): string {
    const id = row.device_model_id != null ? String(row.device_model_id) : "";
    if (id) return id;
    const name = String(row.device_model || "").trim();
    return deviceModelOptions.find((m) => m.name === name)?.id ?? "";
  }

  async function load() {
    const { data } = await http.get("/api/robots", { params: { skip, limit: pageSize } });
    const list = (data.items || []) as Row[];
    const t = Number(data.total);
    if (list.length === 0 && t > 0 && page > 1) { setPage(1); return; }
    setItems(list); setTotal(Number.isFinite(t) ? t : 0);
  }

  useEffect(() => { void loadDeviceModelOptions(); }, []);
  useEffect(() => { void load(); }, [page, pageSize]);

  const dmOptions = deviceModelOptions.map((m) => ({ value: m.id, label: m.status ? `${m.name}（${m.status}）` : m.name }));

  function openAdd() {
    setMode("add"); setEditingId(null);
    form.resetFields(); form.setFieldsValue({ status: ROBOT_STATUS[0], version: "1.0" });
    setFormDlg(true);
  }

  function openEdit(row: Row) {
    setMode("edit"); setEditingId(String(row._id));
    form.setFieldsValue({ name: row.name, device_model_id: resolveDeviceModelId(row), status: row.status, version: row.version, details: row.details || "" });
    setFormDlg(true);
  }

  function openDetail(row: Row) {
    setDetailId(String(row._id));
    detailForm.setFieldsValue({ name: row.name, device_model_id: resolveDeviceModelId(row), device_model: row.device_model, status: row.status, version: row.version, details: row.details || "", created_at: formatDateTime(row.created_at), updated_at: formatDateTime(row.updated_at), created_by: row.created_by || "—", updated_by: row.updated_by || "—" });
    setDetailDlg(true);
  }

  async function saveForm() {
    const vals = await form.validateFields();
    if (!vals.device_model_id?.trim()) { message.warning("请选择设备型号"); return; }
    setSaving(true);
    try {
      if (mode === "add") await http.post("/api/robots", vals);
      else if (editingId) await http.put(`/api/robots/${editingId}`, vals);
      setFormDlg(false); message.success("已保存"); await load();
    } finally { setSaving(false); }
  }

  async function saveDetail() {
    if (!detailId || !canWrite) return;
    const vals = await detailForm.validateFields();
    if (!vals.device_model_id?.trim()) { message.warning("请选择设备型号"); return; }
    setDetailSaving(true);
    try {
      await http.put(`/api/robots/${detailId}`, { name: vals.name, device_model_id: vals.device_model_id, status: vals.status, version: vals.version, details: vals.details });
      message.success("已保存"); setDetailDlg(false); await load();
    } finally { setDetailSaving(false); }
  }

  async function remove(row: Row) {
    Modal.confirm({ title: `确定删除机器人「${row.name}」？`, okType: "danger", onOk: async () => {
      await http.delete(`/api/robots/${row._id}`); message.success("已删除"); await load();
    }});
  }

  const pagination: TablePaginationConfig = {
    current: page, pageSize, total, pageSizeOptions: [10, 20, 50, 100], showSizeChanger: true,
    showTotal: (t) => `共 ${t} 条`,
    onChange: (p, ps) => { if (ps !== pageSize) { setPageSize(ps); setPage(1); } else setPage(p); },
  };

  const columns = [
    { title: "序号", width: 72, align: "center" as const, render: (_: unknown, __: unknown, i: number) => reverseSerialIndex(total, skip, i) },
    { title: "机器人ID", dataIndex: "_id", width: 200, ellipsis: true },
    { title: "机器人名称", dataIndex: "name" },
    { title: "设备型号", dataIndex: "device_model", width: 120 },
    { title: "状态", dataIndex: "status", width: 100 },
    { title: "版本号", dataIndex: "version", width: 100 },
    { title: "创建时间", width: 170, render: (_: unknown, row: Row) => formatDateTime(row.created_at) },
    { title: "更新时间", width: 170, render: (_: unknown, row: Row) => formatDateTime(row.updated_at) },
    { title: "详情", width: 100, fixed: "right" as const, render: (_: unknown, row: Row) => <Button type="link" onClick={() => openDetail(row)}>详情</Button> },
    ...(canWrite ? [{ title: "操作", width: 140, fixed: "right" as const, render: (_: unknown, row: Row) => (<><Button type="link" onClick={() => openEdit(row)}>编辑</Button><Button type="link" danger onClick={() => remove(row)}>删除</Button></>) }] : []),
  ];

  const formFields = (
    <Form.Item label="设备型号" name="device_model_id" rules={[{ required: true }]}>
      <Select options={dmOptions} showSearch filterOption={(i, o) => (o?.label ?? "").toLowerCase().includes(i.toLowerCase())} />
    </Form.Item>
  );

  return (
    <Card title={<div style={{ display: "flex", justifyContent: "space-between" }}><span>机器人管理</span>{canWrite && <Button type="primary" onClick={openAdd}>添加机器人</Button>}</div>}>
      <Table rowKey="_id" dataSource={items} columns={columns} pagination={pagination} bordered size="small" scroll={{ x: "max-content" }} />

      <Modal title={mode === "add" ? "添加机器人" : "修改机器人"} open={formDlg} onOk={saveForm} confirmLoading={saving} onCancel={() => setFormDlg(false)} afterClose={() => form.resetFields()}>
        <Form form={form} labelCol={{ span: 7 }}>
          <Form.Item label="机器人名称" name="name" rules={[{ required: true }]}><Input /></Form.Item>
          {formFields}
          <Form.Item label="机器人状态" name="status" rules={[{ required: true }]}><Select options={ROBOT_STATUS.map((s) => ({ value: s, label: s }))} /></Form.Item>
          <Form.Item label="版本号" name="version" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item label="机器人详情" name="details"><Input.TextArea rows={4} /></Form.Item>
        </Form>
      </Modal>

      <Modal title="机器人详情" open={detailDlg} onOk={canWrite ? saveDetail : undefined} confirmLoading={detailSaving} onCancel={() => setDetailDlg(false)} footer={canWrite ? undefined : [<Button key="close" onClick={() => setDetailDlg(false)}>关闭</Button>]}>
        <Form form={detailForm} labelCol={{ span: 7 }}>
          <Form.Item label="机器人名称" name="name"><Input disabled={!canWrite} /></Form.Item>
          {canWrite
            ? <Form.Item label="设备型号" name="device_model_id"><Select options={dmOptions} showSearch /></Form.Item>
            : <Form.Item label="设备型号" name="device_model"><Input readOnly /></Form.Item>}
          <Form.Item label="机器人状态" name="status"><Select options={ROBOT_STATUS.map((s) => ({ value: s, label: s }))} disabled={!canWrite} /></Form.Item>
          <Form.Item label="版本号" name="version"><Input disabled={!canWrite} /></Form.Item>
          <Form.Item label="机器人详情" name="details"><Input.TextArea rows={5} disabled={!canWrite} /></Form.Item>
          <Form.Item label="创建时间" name="created_at"><Input readOnly /></Form.Item>
          <Form.Item label="更新时间" name="updated_at"><Input readOnly /></Form.Item>
          <Form.Item label="创建人" name="created_by"><Input readOnly /></Form.Item>
          <Form.Item label="更新人" name="updated_by"><Input readOnly /></Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}
