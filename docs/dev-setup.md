# 开发环境配置

## 环境要求

| 工具 | 版本 | 说明 |
|------|------|------|
| Python | 3.10+ | 推荐使用 Conda 管理 |
| Node.js | 18+ | 与 Vite 兼容 |
| MongoDB | 6+ | 本机或远程实例 |
| OpenSSL | 任意 | 可选，仅用于生成本地 HTTPS 证书 |

## 安装依赖

```bash
# 进入仓库根目录
cd /path/to/SsPlatform

# 后端——创建并激活 Conda 环境
conda create -n ssplatform python=3.13 -y
conda activate ssplatform
pip install -U pip
pip install -r requirements.txt

# 前端
cd frontend && npm install && cd ..
```

如果习惯 venv 而非 Conda：`python3 -m venv .venv && source .venv/bin/activate`。

## 环境变量

```bash
cp backend/.env.example backend/.env
```

本地开发通常只需修改以下两项：

| 变量 | 说明 |
|------|------|
| `MONGODB_URI` | MongoDB 连接串 |
| `SECRET_KEY` | 本地开发可用任意随机字符串 |

完整变量列表见 [technical-reference.md](technical-reference.md)。

## 启动（推荐）

一条命令同时启动前后端：

```bash
./start.sh
```

- 后端绑定到 `.env` 中的 `HOST`/`PORT`（默认 `0.0.0.0:8077`）。
- 前端开发服务器运行在 `FRONT_PORT`（默认 `5173`）。
- 若 `frontend/certs/localhost-*.pem` 存在，Vite 以 HTTPS 模式启动。

生成本地自签证书：

```bash
cd frontend && npm run gen-cert
```

## 启动（手动分终端）

**终端 1——后端**（已激活 Conda 环境）：

```bash
cd backend
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8077
```

**终端 2——前端**：

```bash
cd frontend
npm run dev -- --host 0.0.0.0 --port 5173
```

## 访问地址

| 地址 | 说明 |
|------|------|
| `http://localhost:5173` | 前端（Vite 开发服务器） |
| `http://localhost:5173/docs` | Swagger UI（代理到后端） |
| `http://localhost:8077/api/health` | 后端健康检查 |

空库首次启动的默认管理员账号：用户名 `admin`，密码 `admin123`。

## 前端环境变量

仅在需要前端直连非本机后端时设置（如手机访问同局域网的后端）：

```bash
# frontend/.env.local（不提交）
VITE_API_BASE=http://192.168.x.x:8077
```

正常本地开发无需设置，Vite 代理会自动转发请求。

## 常见问题

**接口返回 502 / 连接被拒绝**
后端未启动或 MongoDB 不可达，查看后端终端日志排查。

**MongoDB 连接失败**
检查 `.env` 中的 `MONGODB_URI`，确认 MongoDB 服务正在运行（`mongosh` 验证），并检查防火墙规则。

**浏览器显示 HTTPS 证书警告**
自签证书的预期行为。Chrome/Safari 中点击「高级 → 继续访问」。手机端需将证书安装为受信任的 CA。

**macOS 文件写入报 "Operation not permitted"**
前往「系统设置 → 隐私与安全性」，为终端应用开启「完全磁盘访问」或对应目录权限，重开终端后生效。
