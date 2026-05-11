import { useEffect, useMemo, useState } from "react";
import { Table, Button, Modal, Form, Input, Select, message, Card } from "antd";
import type { TablePaginationConfig } from "antd";
import http from "@/api/http";
import { formatDateTime } from "@/utils/datetime";
import { DEFAULT_PAGE_SIZE, reverseSerialIndex, skipForPage } from "@/utils/pagination";

type Row = Record<string, unknown>;

export default function UsersView() {
  const [items, setItems] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [dlg, setDlg] = useState(false);
  const [mode, setMode] = useState<"add" | "edit">("add");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [roleOptions, setRoleOptions] = useState<{ label: string; value: string }[]>([]);
  const [form] = Form.useForm();
  const skip = useMemo(() => skipForPage(page, pageSize), [page, pageSize]);

  async function load() {
    await loadRoleOptions();
    const { data } = await http.get("/api/users", { params: { skip, limit: pageSize } });
    const list = (data.items || []) as Row[];
    const t = Number(data.total);
    if (list.length === 0 && t > 0 && page > 1) { setPage(1); return; }
    setItems(list);
    setTotal(Number.isFinite(t) ? t : 0);
  }

  async function loadRoleOptions() {
    const { data } = await http.get("/api/roles", { params: { skip: 0, limit: 200 } });
    setRoleOptions((data.items as Row[]).map((r) => ({ value: String(r.code), label: String(r.name) })));
  }

  useEffect(() => { void load(); }, [page, pageSize]);

  function openAdd() {
    setMode("add"); setEditingId(null);
    form.resetFields(); form.setFieldsValue({ role: "evaluator" });
    setDlg(true);
  }

  function openEdit(row: Row) {
    setMode("edit"); setEditingId(String(row._id));
    form.setFieldsValue({ username: row.username, password: "", role: row.role, phone: row.phone || "" });
    setDlg(true);
  }

  async function save() {
    const vals = await form.validateFields();
    if (mode === "add") {
      await http.post("/api/users", vals);
    } else if (editingId) {
      const body: Record<string, string> = { username: vals.username, role: vals.role, phone: vals.phone || "" };
      if (vals.password) body.password = vals.password;
      await http.put(`/api/users/${editingId}`, body);
    }
    setDlg(false); message.success("已保存"); await load();
  }

  async function remove(row: Row) {
    Modal.confirm({ title: "确定删除该用户？", okType: "danger", onOk: async () => {
      await http.delete(`/api/users/${row._id}`);
      message.success("已删除"); await load();
    }});
  }

  const pagination: TablePaginationConfig = {
    current: page, pageSize, total,
    pageSizeOptions: [10, 20, 50, 100], showSizeChanger: true, showTotal: (t) => `共 ${t} 条`,
    onChange: (p, ps) => { if (ps !== pageSize) { setPageSize(ps); setPage(1); } else setPage(p); },
  };

  const columns = [
    { title: "序号", width: 72, align: "center" as const, render: (_: unknown, __: unknown, i: number) => reverseSerialIndex(total, skip, i) },
    { title: "用户ID", dataIndex: "_id", width: 200 },
    { title: "用户名", dataIndex: "username" },
    { title: "角色", dataIndex: "role", render: (v: string) => roleOptions.find((o) => o.value === v)?.label ?? v },
    { title: "手机号", dataIndex: "phone" },
    { title: "创建时间", width: 180, render: (_: unknown, row: Row) => formatDateTime(row.created_at) },
    { title: "更新时间", width: 180, render: (_: unknown, row: Row) => formatDateTime(row.updated_at) },
    { title: "操作", width: 160, fixed: "right" as const, render: (_: unknown, row: Row) => (<><Button type="link" onClick={() => openEdit(row)}>修改</Button><Button type="link" danger onClick={() => remove(row)}>删除</Button></>) },
  ];

  return (
    <Card title={<div style={{ display: "flex", justifyContent: "space-between" }}><span>账号管理</span><Button type="primary" onClick={openAdd}>添加用户</Button></div>}>
      <Table rowKey="_id" dataSource={items} columns={columns} pagination={pagination} bordered size="small" scroll={{ x: "max-content" }} />
      <Modal title={mode === "add" ? "添加用户" : "修改用户"} open={dlg} onOk={save} onCancel={() => setDlg(false)} afterClose={() => form.resetFields()}>
        <Form form={form} labelCol={{ span: 6 }}>
          <Form.Item label="用户名" name="username" rules={[{ required: true }]}>
            <Input disabled={mode === "edit"} />
          </Form.Item>
          <Form.Item label="密码" name="password" rules={mode === "add" ? [{ required: true }] : []}>
            <Input.Password />
          </Form.Item>
          <Form.Item label="角色" name="role" rules={[{ required: true }]}>
            <Select options={roleOptions} />
          </Form.Item>
          <Form.Item label="手机号" name="phone"><Input /></Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}
