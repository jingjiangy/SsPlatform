import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Form, Input, Button, Card, message } from "antd";
import { useAuthStore } from "@/stores/auth";

export default function LoginView() {
  const auth = useAuthStore();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [loading, setLoading] = useState(false);

  async function onFinish({ username, password }: { username: string; password: string }) {
    setLoading(true);
    try {
      await auth.login(username, password);
      navigate(params.get("redirect") || "/materials", { replace: true });
    } catch {
      message.error("登录失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(145deg,#eff6ff 0%,#dbeafe 42%,#fff 100%)" }}>
      <Card style={{ width: "100%", maxWidth: 420, borderRadius: 12, boxShadow: "0 24px 48px rgba(15,23,42,0.08)" }}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <img src="/shengshu_logo.jpeg" alt="logo" style={{ width: 64, height: 64, borderRadius: 12, objectFit: "cover", marginBottom: 14 }} />
          <p style={{ margin: 0, color: "#8c8c8c", fontSize: 13 }}>模型评估平台</p>
        </div>
        <Form layout="vertical" onFinish={onFinish}>
          <Form.Item label="用户名" name="username" rules={[{ required: true }]}>
            <Input autoComplete="username" />
          </Form.Item>
          <Form.Item label="密码" name="password" rules={[{ required: true }]}>
            <Input.Password autoComplete="current-password" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={loading} block>登录</Button>
          </Form.Item>
        </Form>
        <p style={{ fontSize: 12, color: "#bfbfbf", marginTop: 8 }}>默认管理员：admin / admin123（首次启动自动创建）</p>
      </Card>
    </div>
  );
}
