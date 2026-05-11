import { ConfigProvider } from "antd";
import zhCN from "antd/locale/zh_CN";
import AppRouter from "@/router/index";

export default function App() {
  return (
    <ConfigProvider locale={zhCN} theme={{ token: { colorPrimary: "#3b82f6", borderRadius: 8 } }}>
      <AppRouter />
    </ConfigProvider>
  );
}
