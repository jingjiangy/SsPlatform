import { useLocation, useNavigate } from "react-router-dom";
import { Menu } from "antd";
import type { MenuProps } from "antd";
import { canSeeModule } from "@/stores/auth";

export default function SideMenu() {
  const location = useLocation();
  const navigate = useNavigate();
  const selectedKey = location.pathname.split("?")[0];

  const items: MenuProps["items"] = [];

  const systemChildren: MenuProps["items"] = [];
  if (canSeeModule("roles")) systemChildren.push({ key: "/roles", label: "角色管理" });
  if (canSeeModule("users")) systemChildren.push({ key: "/users", label: "账号管理" });
  if (systemChildren.length > 0) {
    items.push({ key: "system", label: <span style={{ fontWeight: 600, letterSpacing: "0.03em" }}>系统管理</span>, children: systemChildren });
  }

  const worldChildren: MenuProps["items"] = [];
  if (canSeeModule("materials")) worldChildren.push({ key: "/materials", label: "素材库" });
  if (canSeeModule("eval_templates")) worldChildren.push({ key: "/eval-templates", label: "评测模板" });
  if (canSeeModule("eval")) worldChildren.push({ key: "/evaluations", label: "评测任务" });
  if (worldChildren.length > 0) {
    items.push({ key: "world", label: <span style={{ fontWeight: 600, letterSpacing: "0.03em" }}>世界模型素材库</span>, children: worldChildren });
  }

  const deviceChildren: MenuProps["items"] = [];
  if (canSeeModule("device_models")) deviceChildren.push({ key: "/device-models", label: "设备型号" });
  if (canSeeModule("robots")) deviceChildren.push({ key: "/robots", label: "机器人管理" });
  if (canSeeModule("parts")) deviceChildren.push({ key: "/parts", label: "配件管理" });
  if (canSeeModule("fault_records")) deviceChildren.push({ key: "/fault-records", label: "故障记录" });
  if (deviceChildren.length > 0) {
    items.push({ key: "device", label: <span style={{ fontWeight: 600, letterSpacing: "0.03em" }}>设备管理</span>, children: deviceChildren });
  }

  if (canSeeModule("api_docs")) {
    items.push({ key: "/api-docs", label: "接口文档", style: { marginTop: 8 } });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 12, padding: "20px 18px 18px", borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
        <img src="/shengshu_logo.jpeg" alt="logo" style={{ width: 36, height: 36, borderRadius: 6, objectFit: "cover", flexShrink: 0 }} />
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={{ fontWeight: 700, fontSize: 15, letterSpacing: "0.02em", color: "#f1f5f9", lineHeight: 1.3 }}>模型评估平台</span>
          <span style={{ fontSize: 11, color: "#94a3b8" }}>世界模型 · 评测</span>
        </div>
      </div>
      <div style={{ flex: 1, overflow: "auto" }}>
        <Menu
          mode="inline"
          selectedKeys={[selectedKey]}
          defaultOpenKeys={["system", "world", "device"]}
          items={items}
          onClick={({ key }) => navigate(key)}
          style={{ background: "transparent", border: "none", padding: "10px 8px 20px" }}
          theme="dark"
        />
      </div>
    </div>
  );
}
