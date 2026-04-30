import { useEffect, useMemo, useRef, useState } from "react";
import { Table, Button, Modal, Form, Input, Select, Upload, message, Card, Tag, Tooltip } from "antd";
import type { TablePaginationConfig, TableProps } from "antd";
import http from "@/api/http";
import { MATERIAL_TYPES, MATERIAL_STATUS } from "@/constants/options";
import { canWriteMaterial } from "@/stores/auth";
import { resolveMediaUrl } from "@/utils/media";
import { formatDateTime } from "@/utils/datetime";
import { DEFAULT_PAGE_SIZE, reverseSerialIndex, skipForPage } from "@/utils/pagination";
import { useNavigate, useSearchParams } from "react-router-dom";

type Row = Record<string, unknown>;
type DeviceModelOption = { id: string; name: string; status: string };

export default function MaterialsView() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [items, setItems] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [expandedKeys, setExpandedKeys] = useState<string[]>([]);
  const [childrenMap, setChildrenMap] = useState<Record<string, Row[]>>({});
  const [dlg, setDlg] = useState(false);
  const [mode, setMode] = useState<"add" | "edit">("add");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [fileLabel, setFileLabel] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [videoDlg, setVideoDlg] = useState(false);
  const [deviceModelOptions, setDeviceModelOptions] = useState<DeviceModelOption[]>([]);
  const [form] = Form.useForm();
  const canWrite = canWriteMaterial();
  const skip = useMemo(() => skipForPage(page, pageSize), [page, pageSize]);
  const tableRef = useRef<HTMLDivElement>(null);

  async function loadDeviceModelOptions() {
    try {
      const { data } = await http.get("/api/materials/device-model-options");
      setDeviceModelOptions((data.items || []) as DeviceModelOption[]);
    } catch { setDeviceModelOptions([]); }
  }

  function resolveDeviceModelId(row: Row): string {
    const id = row.device_model_id != null ? String(row.device_model_id) : "";
    if (id) return id;
    const name = String(row.robot_device_model || "").trim();
    return deviceModelOptions.find((m) => m.name === name)?.id ?? "";
  }

  async function load() {
    const { data } = await http.get("/api/materials", { params: { skip, limit: pageSize } });
    const list = (data.items || []) as Row[];
    const t = Number(data.total);
    if (list.length === 0 && t > 0 && page > 1) { setPage(1); return; }
    setItems(list.map((r) => ({ ...r, hasChildren: Number(r.child_count ?? 0) > 0 })));
    setTotal(Number.isFinite(t) ? t : 0);
    setChildrenMap({});
    setExpandedKeys([]);
  }

  useEffect(() => { void loadDeviceModelOptions(); }, []);
  useEffect(() => { void load(); }, [page, pageSize]);

  // handle expandMaterial query param
  useEffect(() => {
    const id = searchParams.get("expandMaterial");
    if (!id || !items.length) return;
    const row = items.find((r) => String(r._id) === id);
    if (row?.hasChildren) {
      void loadChildren(row).then(() => {
        setExpandedKeys((prev) => prev.includes(id) ? prev : [...prev, id]);
        setTimeout(() => {
          const el = tableRef.current?.querySelector(`tr[data-row-key="${id}"]`);
          el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
        }, 100);
      });
    }
    setSearchParams({}, { replace: true });
  }, [searchParams, items]);

  async function loadChildren(row: Row): Promise<void> {
    const id = String(row._id);
    if (childrenMap[id]) return;
    if (!Number(row.child_count ?? 0)) { setChildrenMap((p) => ({ ...p, [id]: [] })); return; }
    try {
      const { data } = await http.get("/api/materials", { params: { parent_id: id, skip: 0, limit: 200 } });
      setChildrenMap((p) => ({ ...p, [id]: (data.items as Row[]).map((c) => ({ ...c, hasChildren: false })) }));
    } catch { setChildrenMap((p) => ({ ...p, [id]: [] })); }
  }

  const expandable: TableProps<Row>["expandable"] = {
    expandedRowKeys: expandedKeys,
    onExpand: async (expanded, record) => {
      const id = String(record._id);
      if (expanded) { await loadChildren(record); setExpandedKeys((p) => [...p, id]); }
      else setExpandedKeys((p) => p.filter((k) => k !== id));
    },
    rowExpandable: (r) => !!r.hasChildren,
    childrenColumnName: "__children__",
  };

  // flatten items with children for antd table
  const tableData = useMemo(() => {
    const result: Row[] = [];
    for (const row of items) {
      result.push(row);
      const id = String(row._id);
      if (expandedKeys.includes(id) && childrenMap[id]) {
        result.push(...childrenMap[id]);
      }
    }
    return result;
  }, [items, expandedKeys, childrenMap]);

  function goVersions(row: Row) {
    const parentId = row.parent_id ? String(row.parent_id) : String(row._id);
    navigate(`/materials/${parentId}/versions`);
  }

  function goEval(row: Row) {
    navigate(`/evaluations/by-material?materialId=${row._id}&materialName=${encodeURIComponent(String(row.name))}`);
  }

  async function openAdd() {
    setMode("add"); setEditingId(null); setFile(null); setFileLabel("");
    await loadDeviceModelOptions();
    form.resetFields(); form.setFieldsValue({ material_type: MATERIAL_TYPES[0], status: MATERIAL_STATUS[0] });
    setDlg(true);
  }

  async function openEdit(row: Row) {
    setMode("edit"); setEditingId(String(row._id)); setFile(null); setFileLabel("");
    await loadDeviceModelOptions();
    form.setFieldsValue({ name: row.name, description: row.description || "", material_type: row.material_type, status: row.status, device_model_id: resolveDeviceModelId(row) });
    setDlg(true);
  }

  async function save() {
    const vals = await form.validateFields();
    if (!vals.device_model_id?.trim()) { message.warning("请选择机器人型号"); return; }
    setSaving(true);
    try {
      let id = editingId;
      if (mode === "add") {
        const { data } = await http.post("/api/materials", { ...vals, version: "1.0", parent_id: null });
        id = String(data._id);
      } else if (id) {
        await http.put(`/api/materials/${id}`, vals);
      }
      if (file && id) {
        const fd = new FormData(); fd.append("file", file);
        await http.post(`/api/materials/${id}/video`, fd, { headers: { "Content-Type": "multipart/form-data" } });
      }
      setDlg(false); message.success("已保存"); await load();
    } finally { setSaving(false); }
  }

  async function remove(row: Row) {
    const isChild = !!row.parent_id;
    Modal.confirm({ title: isChild ? "确定删除该子版本？" : "将同时删除子版本，确定？", okType: "danger", onOk: async () => {
      await http.delete(`/api/materials/${row._id}`); message.success("已删除"); await load();
    }});
  }

  const pagination: TablePaginationConfig = {
    current: page, pageSize, total, pageSizeOptions: [10, 20, 50, 100], showSizeChanger: true,
    showTotal: (t) => `共 ${t} 条`,
    onChange: (p, ps) => { if (ps !== pageSize) { setPageSize(ps); setPage(1); } else setPage(p); },
  };

  const dmOptions = deviceModelOptions.map((m) => ({ value: m.id, label: m.status ? `${m.name}（${m.status}）` : m.name }));

  const columns = [
    { title: "序号", width: 72, align: "center" as const, render: (_: unknown, __: unknown, i: number) => reverseSerialIndex(total, skip, i) },
    { title: "素材ID", dataIndex: "_id", width: 200, ellipsis: true },
    { title: "名称", minWidth: 200, render: (_: unknown, row: Row) => (
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
        <Button type="link" style={{ padding: 0 }} onClick={() => goVersions(row)}>{String(row.name)}</Button>
        {!row.parent_id && <Tag color="default">{Number(row.child_count ?? 0) + 1} 个版本</Tag>}
      </div>
    )},
    { title: "描述", dataIndex: "description", ellipsis: true, minWidth: 160 },
    { title: "类型", dataIndex: "material_type", width: 110 },
    { title: "状态", dataIndex: "status", width: 100 },
    { title: "机器人型号", width: 120, render: (_: unknown, row: Row) => String(row.robot_device_model || "—") },
    { title: <Tooltip title="父行：父素材自身版本号。子行：该子素材的版本号。"><span style={{ cursor: "help", textDecoration: "underline dotted" }}>版本号</span></Tooltip>, dataIndex: "version", width: 96 },
    { title: "视频", width: 120, render: (_: unknown, row: Row) => row.video_url ? <Button type="link" onClick={() => { setVideoUrl(resolveMediaUrl(String(row.video_url))); setVideoDlg(true); }}>预览视频</Button> : "—" },
    { title: "创建时间", width: 180, render: (_: unknown, row: Row) => formatDateTime(row.created_at) },
    { title: "更新时间", width: 180, render: (_: unknown, row: Row) => formatDateTime(row.updated_at) },
    { title: "关联评测", width: 100, fixed: "right" as const, render: (_: unknown, row: Row) => <Button type="link" onClick={() => goEval(row)}>关联评测</Button> },
    ...(canWrite ? [{ title: "操作", width: 200, fixed: "right" as const, render: (_: unknown, row: Row) => (<><Button type="link" onClick={() => openEdit(row)}>编辑</Button><Button type="link" danger onClick={() => remove(row)}>删除</Button></>) }] : []),
  ];

  return (
    <Card title={<div style={{ display: "flex", justifyContent: "space-between" }}><span>世界模型素材库（父级列表）</span>{canWrite && <Button type="primary" onClick={openAdd}>添加素材</Button>}</div>}>
      <div ref={tableRef}>
        <Table rowKey="_id" dataSource={tableData} columns={columns} pagination={pagination} expandable={expandable} bordered size="small" scroll={{ x: "max-content" }} />
      </div>

      <Modal title={mode === "add" ? "添加世界模型素材" : "编辑世界模型素材"} open={dlg} onOk={save} confirmLoading={saving} onCancel={() => setDlg(false)} width={640} afterClose={() => form.resetFields()}>
        <Form form={form} labelCol={{ span: 6 }}>
          <Form.Item label="名称" name="name" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item label="描述" name="description"><Input.TextArea rows={4} /></Form.Item>
          <Form.Item label="类型" name="material_type" rules={[{ required: true }]}><Select options={MATERIAL_TYPES.map((t) => ({ value: t, label: t }))} /></Form.Item>
          <Form.Item label="状态" name="status" rules={[{ required: true }]}><Select options={MATERIAL_STATUS.map((s) => ({ value: s, label: s }))} /></Form.Item>
          <Form.Item label="机器人型号" name="device_model_id" rules={[{ required: true }]}>
            <Select options={dmOptions} showSearch filterOption={(i, o) => (o?.label ?? "").toLowerCase().includes(i.toLowerCase())} allowClear placeholder="请选择机器人型号" />
          </Form.Item>
          <Form.Item label="上传视频(mp4)">
            <Upload accept="video/mp4" beforeUpload={(f) => { setFile(f); setFileLabel(f.name); return false; }} showUploadList={false}>
              <Button>选择文件</Button>
            </Upload>
            {fileLabel && <span style={{ marginLeft: 8, color: "#8c8c8c", fontSize: 12 }}>{fileLabel}</span>}
          </Form.Item>
        </Form>
      </Modal>

      <Modal title="视频预览" open={videoDlg} onCancel={() => { setVideoDlg(false); setVideoUrl(""); }} footer={null} width="min(720px, 92vw)" destroyOnClose>
        {videoUrl && <video key={videoUrl} src={videoUrl} style={{ width: "100%", maxHeight: "min(70vh, 520px)", borderRadius: 4, background: "#000", objectFit: "contain" }} controls playsInline preload="metadata" />}
      </Modal>
    </Card>
  );
}
