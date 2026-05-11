import { useEffect, useMemo, useState } from "react";
import { Table, Button, Modal, Form, Input, Checkbox, Tag, message, Card } from "antd";
import type { TablePaginationConfig } from "antd";
import http from "@/api/http";
import { ROLE_MODULE_OPTIONS } from "@/constants/options";
import { formatDateTime } from "@/utils/datetime";
import { DEFAULT_PAGE_SIZE, reverseSerialIndex, skipForPage } from "@/utils/pagination";

type Row = Record<string, unknown>;
const moduleLabelMap = Object.fromEntries(ROLE_MODULE_OPTIONS.map((o) => [o.value, o.label]));

export default function RolesView() {
  const [items, setItems] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [dlg, setDlg] = useState(false);
  const [mode, setMode] = useState<"add" | "edit">("add");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form] = Form.useForm();
  const skip = useMemo(() => skipForPage(page, pageSize), [page, pageSize]);

  async function load() {
    const { data } = await http.get("/api/roles", { params: { skip, limit: pageSize } });
    const list = (data.items || []) as Row[];
    const t = Number(data.total);
    if (list.length === 0 && t > 0 && page > 1) { setPage(1); return; }
    setItems(list); setTotal(Number.isFinite(t) ? t : 0);
  }

  useEffect(() => { void load(); }, [page, pageSize]);

  function openAdd() {
    setMode("add"); setEditingId(null); form.resetFields(); setDlg(true);
  }

  function openEdit(row: Row) {
    setMode("edit"); setEditingId(String(row._id));
    form.setFieldsValue({ name: row.name, code: row.code, description: row.description || "", modules: Array.isArray(row.modules) ? row.modules : [] });
    setDlg(true);
  }

  async function save() {
    const vals = await form.validateFields();
    if (!vals.modules?.length) { message.warning("请至少勾选一个系统模块权限"); return; }
    if (mode === "add") {
      await http.post("/api/roles", vals);
    } else if (editingId) {
      await http.put(`/api/roles/${editingId}`, { name: vals.name, description: vals.description, modules: vals.modules });
    }
    setDlg(false); message.success("已保存"); await load();
  }

  async function remove(row: Row) {
    Modal.confirm({ title: "确定删除该角色？", okType: "danger", onOk: async () => {
      await http.delete(`/api/roles/${row._id}`);
      message.success("已删除"); await load();
    }});
  }

  const pagination: TablePaginationConfig = {
    current: page, pageSize, total, pageSizeOptions: [10, 20, 50, 100], showSizeChanger: true,
    showTotal: (t) => `共 ${t} 条`,
    onChange: (p, ps) => { if (ps !== pageSize) { setPageSize(ps); setPage(1); } else setPage(p); },
  };

  const columns = [
    { title: "序号", width: 72, align: "center" as const, render: (_: unknown, __: unknown, i: number) => reverseSerialIndex(total, skip, i) },
    { title: "角色ID", dataIndex: "_id", width: 200 },
    { title: "名称", dataIndex: "name" },
    { title: "编码", dataIndex: "code" },
    { title: "描述", dataIndex: "description", ellipsis: true },
    { title: "模块权限", render: (_: unknown, row: Row) => {
      const mods = Array.isArray(row.modules) ? row.modules as string[] : [];
      return mods.length ? mods.map((m) => <Tag key={m} style={{ marginBottom: 2 }}>{moduleLabelMap[m] || m}</Tag>) : <span style={{ color: "#bfbfbf" }}>—</span>;
    }},
    { title: "创建时间", width: 180, render: (_: unknown, row: Row) => formatDateTime(row.created_at) },
    { title: "更新时间", width: 180, render: (_: unknown, row: Row) => formatDateTime(row.updated_at) },
    { title: "操作", width: 160, fixed: "right" as const, render: (_: unknown, row: Row) => (<><Button type="link" onClick={() => openEdit(row)}>修改</Button><Button type="link" danger onClick={() => remove(row)}>删除</Button></>) },
  ];

  return (
    <Card title={<div style={{ display: "flex", justifyContent: "space-between" }}><span>角色管理</span><Button type="primary" onClick={openAdd}>添加角色</Button></div>}>
      <Table rowKey="_id" dataSource={items} columns={columns} pagination={pagination} bordered size="small" scroll={{ x: "max-content" }} />
      <Modal title={mode === "add" ? "添加角色" : "修改角色"} open={dlg} onOk={save} onCancel={() => setDlg(false)} afterClose={() => form.resetFields()} width={600}>
        <Form form={form} labelCol={{ span: 6 }}>
          <Form.Item label="名称" name="name" rules={[{ required: true }]}>
            <Input disabled={mode === "edit"} />
          </Form.Item>
          {mode === "add" && <Form.Item label="编码" name="code" rules={[{ required: true }]}><Input placeholder="如 custom_role" /></Form.Item>}
          <Form.Item label="描述" name="description"><Input.TextArea /></Form.Item>
          <Form.Item label="模块权限" name="modules" rules={[{ required: true }]}>
            <Checkbox.Group options={ROLE_MODULE_OPTIONS} style={{ display: "flex", flexWrap: "wrap", gap: 8 }} />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}
