import { useEffect, useMemo, useState } from "react";
import { Table, Button, Modal, Form, Input, Select, message, Card } from "antd";
import type { TablePaginationConfig } from "antd";
import http from "@/api/http";
import { PART_STATUS } from "@/constants/options";
import { canWritePart } from "@/stores/auth";
import { formatDateTime } from "@/utils/datetime";
import { DEFAULT_PAGE_SIZE, reverseSerialIndex, skipForPage } from "@/utils/pagination";

type Row = Record<string, unknown>;

export default function PartsView() {
  const [items, setItems] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [dlg, setDlg] = useState(false);
  const [mode, setMode] = useState<"add" | "edit">("add");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form] = Form.useForm();
  const canWrite = canWritePart();
  const skip = useMemo(() => skipForPage(page, pageSize), [page, pageSize]);

  async function load() {
    const { data } = await http.get("/api/parts", { params: { skip, limit: pageSize } });
    const list = (data.items || []) as Row[];
    const t = Number(data.total);
    if (list.length === 0 && t > 0 && page > 1) { setPage(1); return; }
    setItems(list); setTotal(Number.isFinite(t) ? t : 0);
  }

  useEffect(() => { void load(); }, [page, pageSize]);

  function openAdd() { setMode("add"); setEditingId(null); form.resetFields(); form.setFieldsValue({ status: PART_STATUS[0] }); setDlg(true); }
  function openEdit(row: Row) {
    setMode("edit"); setEditingId(String(row._id));
    form.setFieldsValue({ name: row.name, description: row.description || "", status: row.status, version: row.version || "" });
    setDlg(true);
  }

  async function save() {
    const vals = await form.validateFields();
    if (mode === "add") await http.post("/api/parts", vals);
    else if (editingId) await http.put(`/api/parts/${editingId}`, vals);
    setDlg(false); message.success("已保存"); await load();
  }

  async function remove(row: Row) {
    Modal.confirm({ title: "确定删除该配件？", okType: "danger", onOk: async () => {
      await http.delete(`/api/parts/${row._id}`); message.success("已删除"); await load();
    }});
  }

  const pagination: TablePaginationConfig = {
    current: page, pageSize, total, pageSizeOptions: [10, 20, 50, 100], showSizeChanger: true,
    showTotal: (t) => `共 ${t} 条`,
    onChange: (p, ps) => { if (ps !== pageSize) { setPageSize(ps); setPage(1); } else setPage(p); },
  };

  const columns = [
    { title: "序号", width: 72, align: "center" as const, render: (_: unknown, __: unknown, i: number) => reverseSerialIndex(total, skip, i) },
    { title: "配件ID", dataIndex: "_id", width: 200 },
    { title: "配件名称", dataIndex: "name" },
    { title: "描述", dataIndex: "description", ellipsis: true },
    { title: "状态", dataIndex: "status", width: 100 },
    { title: "版本号", dataIndex: "version", width: 100 },
    { title: "创建时间", width: 180, render: (_: unknown, row: Row) => formatDateTime(row.created_at) },
    { title: "更新时间", width: 180, render: (_: unknown, row: Row) => formatDateTime(row.updated_at) },
    ...(canWrite ? [{ title: "操作", width: 160, fixed: "right" as const, render: (_: unknown, row: Row) => (<><Button type="link" onClick={() => openEdit(row)}>编辑</Button><Button type="link" danger onClick={() => remove(row)}>删除</Button></>) }] : []),
  ];

  return (
    <Card title={<div style={{ display: "flex", justifyContent: "space-between" }}><span>配件管理</span>{canWrite && <Button type="primary" onClick={openAdd}>添加配件</Button>}</div>}>
      <Table rowKey="_id" dataSource={items} columns={columns} pagination={pagination} bordered size="small" scroll={{ x: "max-content" }} />
      <Modal title={mode === "add" ? "添加配件" : "修改配件"} open={dlg} onOk={save} onCancel={() => setDlg(false)} afterClose={() => form.resetFields()}>
        <Form form={form} labelCol={{ span: 6 }}>
          <Form.Item label="配件名称" name="name" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item label="描述" name="description"><Input.TextArea /></Form.Item>
          <Form.Item label="状态" name="status" rules={[{ required: true }]}><Select options={PART_STATUS.map((s) => ({ value: s, label: s }))} /></Form.Item>
          <Form.Item label="版本号" name="version"><Input /></Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}
