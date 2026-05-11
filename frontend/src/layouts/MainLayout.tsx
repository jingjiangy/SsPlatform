import { useEffect, useRef, useState } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { Layout, Button, Drawer } from "antd";
import { MenuFoldOutlined, MenuUnfoldOutlined } from "@ant-design/icons";
import { useAuthStore } from "@/stores/auth";
import SideMenu from "./SideMenu";

const { Sider, Header, Content } = Layout;
const ASIDE_KEY = "main-layout-aside-collapsed";

const ROLE_LABELS: Record<string, string> = {
  admin: "管理员", evaluator: "评测员", rd: "研发", collector: "采集员",
};

export default function MainLayout() {
  const auth = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(ASIDE_KEY) === "1");
  const [isCompact, setIsCompact] = useState(() => window.matchMedia("(max-width: 1023px)").matches);
  const mqRef = useRef<MediaQueryList | null>(null);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1023px)");
    mqRef.current = mq;
    const handler = (e: MediaQueryListEvent) => {
      setIsCompact(e.matches);
      if (e.matches) setCollapsed(true);
    };
    mq.addEventListener("change", handler);
    if (mq.matches) setCollapsed(true);
    return () => mq.removeEventListener("change", handler);
  }, []);

  useEffect(() => {
    localStorage.setItem(ASIDE_KEY, collapsed ? "1" : "0");
  }, [collapsed]);

  useEffect(() => {
    if (isCompact) setCollapsed(true);
  }, [location.pathname, isCompact]);

  function onLogout() {
    auth.logout();
    navigate("/login");
  }

  const roleLabel = ROLE_LABELS[auth.role || ""] || auth.role || "";

  const sideMenu = <SideMenu />;

  return (
    <Layout style={{ minHeight: "100dvh" }}>
      {!isCompact && (
        <Sider
          collapsed={collapsed}
          collapsedWidth={0}
          width={220}
          style={{
            background: "linear-gradient(180deg, #0f172a 0%, #1e293b 100%)",
            borderRight: collapsed ? "none" : "1px solid rgba(255,255,255,0.08)",
            overflow: "hidden",
            transition: "all 0.25s ease",
          }}
          trigger={null}
        >
          {sideMenu}
        </Sider>
      )}
      {isCompact && (
        <Drawer
          open={!collapsed}
          onClose={() => setCollapsed(true)}
          placement="left"
          width="min(280px, 86vw)"
          styles={{ body: { padding: 0, background: "linear-gradient(180deg, #0f172a 0%, #1e293b 100%)" }, header: { display: "none" } }}
          closable={false}
        >
          {sideMenu}
        </Drawer>
      )}
      <Layout>
        <Header style={{ background: "#fff", borderBottom: "1px solid #f0f0f0", padding: "0 16px", height: 56, display: "flex", alignItems: "center", gap: 12 }}>
          <Button
            type="text"
            icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? "展开侧栏" : "收起侧栏"}
            style={{ marginRight: "auto", fontSize: 18 }}
          />
          <span style={{ fontSize: 14, color: "#595959" }}>{auth.username}（{roleLabel}）</span>
          <Button type="link" onClick={onLogout}>退出</Button>
        </Header>
        <Content style={{ padding: 24, overflow: "auto", background: "#f5f7fa" }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
