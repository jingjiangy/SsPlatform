import { useEffect, useMemo, useState } from "react";
import { Table, Button, Modal, Form, Input, Select, Upload, message, Card } from "antd";
import type { TablePaginationConfig } from "antd";
import { useParams, useNavigate } from "react-router-dom";
import http from "@/api/http";
import { MATERIAL_TYPES, MATERIAL_STATUS } from "@/constants/options";
import { canWriteMaterial } from "@/stores/auth";
import { resolveMediaUrl } from "@/utils/media";
import { formatDateTime } from "@/utils/datetime";
import { DEFAULT_PAGE_SIZE, reverseSerialIndex, skipForPage } from "@/utils/pagination";

type Row = Record<string, unknown>;
type DeviceModelOption = { id: string; name: string; status: string };

export default function MaterialVersionsView() {
  const { parentId } = useParams<{ parentId: string }>();
  const navigate = useNavigate();
  const [items, setItems] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [dlg, setDlg] = useState(false);
  const [editDlg, setEditDlg] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [fileLabel, setFileLabel] = useState("");
  const [editFile, setEditFile] = useState<File | null>(null);
  const [editFileLabel, setEditFileLabel] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [videoDlg, setVideoDlg] = useState(false);
  const [deviceModelOptions, setDeviceModelOptions] = useState<DeviceModelOption[]>([]);
  const [form] = Form.useForm();
  const [editForm] = Form.useForm();
  const canWrite = canWriteMaterial();
  const skip = useMemo(() => skipForPage(page, pageSize), [page, pageSize]);

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
    if (!parentId) return;
    const { data } = await http.get("/api/materials", { params: { parent_id: parentId, skip, limit: pageSize } });
    const list = (data.items || []) as Row[];
    const t = Number(data.total);
    if (list.length === 0 && t > 0 && page > 1) { setPage(1); return; }
    setItems(list); setTotal(Number.isFinite(t) ? t : 0);
  }

  useEffect(() => { void loadDeviceModelOptions(); }, []);
  useEffect(() => { void load(); }, [page, pageSize, parentId]);

  const dmOptions = deviceModelOptions.map((m) => ({ value: m.id, label: m.status ? `${m.name}（${m.status}）` : m.name }));

  function openAdd() { form.resetFields(); form.setFieldsValue({ material_type: MATERIAL_TYPES[0], status: MATERIAL_STATUS[0] }); setFile(null); setFileLabel(""); setDlg(true); }
  function openEdit(row: Row) {
    setEditingId(String(row._id));
    editForm.setFieldsValue({ name: row.name, description: row.description || "", material_type: row.material_type, status: row.status, device_model_id: resolveDeviceModelId(row), version: row.version });
    setEditFile(null); setEditFileLabel(""); setEditDlg(true);
  }

  async function saveSub() {
    const vals = await form.validateFields();
    if (!vals.device_model_id?.trim()) { message.warning("请选择机器人型号"); return; }
    setSaving(true);
    try {
      const { data } = await http.post("/api/materials", { ...vals, parent_id: parentId });
      if (file) {
        const fd = new FormData(); fd.append("file", file);
        await http.post(`/api/materials/${data._id}/video`, fd, { headers: { "Content-Type": "multipart/form-data" } });
      }
      setDlg(false); message.success("已保存"); await load();
    } finally { setSaving(false); }
  }

  async function saveEdit() {
    if (!editingId) return;
    const vals = await editForm.validateFields();
    if (!vals.device_model_id?.trim()) { message.warning("请选择机器人型号"); return; }
    setSaving(true);
    try {
      await http.put(`/api/materials/${editingId}`, vals);
      if (editFile) {
        const fd = new FormData(); fd.append("file", editFile);
        await http.post(`/api/materials/${editingId}/video`, fd, { headers: { "Content-Type": "multipart/form-data" } });
      }
      setEditDlg(false); message.success("已保存"); await load();
    } finally { setSaving(false); }
  }

  async function remove(row: Row) {
    Modal.confirm({ title: "确定删除该子版本？", okType: "danger", onOk: async () => {
      await http.delete(`/api/materials/${row._id}`); message.success("已删除"); await load();
    }});
  }

  const pagination: TablePaginationConfig = {
    current: page, pageSize, total, pageSizeOptions: [10, 20, 50, 100], showSizeChanger: true,
    showTotal: (t) => `共 ${t} 条`,
    onChange: (p, ps) => { if (ps !== pageSize) { setPageSize(ps); setPage(1); } else setPage(p); },
  };

  const columns = [
    { title: "序号", width: 72, align: "center" as const, render: (_: unknown, __: unknown, i: number) => reverseSerialIndex(total, skip, i) },
    { title: "素材ID", dataIndex: "_id", width: 200, ellipsis: true },
    { title: "名称", dataIndex: "name" },
    { title: "描述", dataIndex: "description", ellipsis: true },
    { title: "版本", dataIndex: "version", width: 80 },
    { title: "类型", dataIndex: "material_type", width: 110 },
    { title: "状态", dataIndex: "status", width: 100 },
    { title: "机器人型号", width: 120, render: (_: unknown, row: Row) => String(row.robot_device_model || "—") },
    { title: "视频", width: 120, render: (_: unknown, row: Row) => row.video_url ? <Button type="link" onClick={() => { setVideoUrl(resolveMediaUrl(String(row.video_url))); setVideoDlg(true); }}>预览视频</Button> : "—" },
    { title: "创建时间", width: 180, render: (_: unknown, row: Row) => formatDateTime(row.created_at) },
    { title: "更新时间", width: 180, render: (_: unknown, row: Row) => formatDateTime(row.updated_at) },
    { title: "关联评测", width: 100, render: (_: unknown, row: Row) => <Button type="link" onClick={() => navigate(`/evaluations/by-material?materialId=${row._id}&materialName=${encodeURIComponent(String(row.name))}`)}>关联评测</Button> },
    ...(canWrite ? [{ title: "操作", width: 160, fixed: "right" as const, render: (_: unknown, row: Row) => (<><Button type="link" onClick={() => openEdit(row)}>编辑</Button><Button type="link" danger onClick={() => remove(row)}>删除</Button></>) }] : []),
  ];

  const formFields = (_form: ReturnType<typeof Form.useForm>[0]) => (
    <>
      <Form.Item label="名称" name="name" rules={[{ required: true }]}><Input /></Form.Item>
      <Form.Item label="描述" name="description"><Input.TextArea rows={4} /></Form.Item>
      <Form.Item label="类型" name="material_type" rules={[{ required: true }]}><Select options={MATERIAL_TYPES.map((t) => ({ value: t, label: t }))} /></Form.Item>
      <Form.Item label="状态" name="status" rules={[{ required: true }]}><Select options={MATERIAL_STATUS.map((s) => ({ value: s, label: s }))} /></Form.Item>
      <Form.Item label="机器人型号" name="device_model_id" rules={[{ required: true }]}><Select options={dmOptions} showSearch allowClear /></Form.Item>
    </>
  );

  return (
    <Card title={
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Button type="link" onClick={() => navigate("/materials")}>← 返回</Button>
          <span>子版本列表（父素材 {parentId}）</span>
        </div>
        {canWrite && <Button type="primary" onClick={openAdd}>添加版本</Button>}
      </div>
    }>
      <Table rowKey="_id" dataSource={items} columns={columns} pagination={pagination} bordered size="small" scroll={{ x: "max-content" }} />

      <Modal title="添加子版本" open={dlg} onOk={saveSub} confirmLoading={saving} onCancel={() => setDlg(false)} width={640} afterClose={() => form.resetFields()}>
        <Form form={form} labelCol={{ span: 6 }}>
          {formFields(form)}
          <Form.Item label="上传视频(mp4)">
            <Upload accept="video/mp4" beforeUpload={(f) => { setFile(f); setFileLabel(f.name); return false; }} showUploadList={false}><Button>选择文件</Button></Upload>
            {fileLabel && <span style={{ marginLeft: 8, color: "#8c8c8c", fontSize: 12 }}>{fileLabel}</span>}
          </Form.Item>
        </Form>
      </Modal>

      <Modal title="编辑子版本" open={editDlg} onOk={saveEdit} confirmLoading={saving} onCancel={() => setEditDlg(false)} width={640} afterClose={() => editForm.resetFields()}>
        <Form form={editForm} labelCol={{ span: 6 }}>
          {formFields(editForm)}
          <Form.Item label="版本号"><span style={{ color: "#8c8c8c", fontSize: 13 }}>{editForm.getFieldValue("version")}（不可修改）</span></Form.Item>
          <Form.Item label="上传视频(mp4)">
            <Upload accept="video/mp4" beforeUpload={(f) => { setEditFile(f); setEditFileLabel(f.name); return false; }} showUploadList={false}><Button>选择文件</Button></Upload>
            {editFileLabel && <span style={{ marginLeft: 8, color: "#8c8c8c", fontSize: 12 }}>{editFileLabel}</span>}
          </Form.Item>
        </Form>
      </Modal>

      <Modal title="视频预览" open={videoDlg} onCancel={() => { setVideoDlg(false); setVideoUrl(""); }} footer={null} width="min(720px, 92vw)" destroyOnClose>
        {videoUrl && <video key={videoUrl} src={videoUrl} style={{ width: "100%", maxHeight: "min(70vh, 520px)", borderRadius: 4, background: "#000", objectFit: "contain" }} controls playsInline preload="metadata" />}
      </Modal>
    </Card>
  );
}
