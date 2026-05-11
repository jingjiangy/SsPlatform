# 技术参考

## 技术栈

| 层级 | 技术 |
|------|------|
| 后端 | Python 3.10+、FastAPI、Uvicorn |
| 数据库 | MongoDB（异步 Motor 驱动） |
| 认证 | JWT HS256 + bcrypt |
| 前端 | React 19、TypeScript、Vite |
| UI 组件 | Ant Design v6 |
| 状态管理 | Zustand v5（persist 中间件） |
| 路由 | React Router v7 |
| HTTP 客户端 | Axios |

## 目录结构

```
SsPlatform/
├── backend/
│   ├── app/
│   │   ├── main.py            # FastAPI 应用入口、中间件、lifespan
│   │   ├── config.py          # 配置项（pydantic-settings，读取 .env）
│   │   ├── database.py        # Motor 连接、集合辅助函数
│   │   ├── deps.py            # FastAPI 依赖（认证、分页）
│   │   ├── security.py        # JWT 编解码、bcrypt 工具
│   │   ├── permissions.py     # 角色编码、权限键、展开逻辑
│   │   ├── startup.py         # 启动时自动执行的 DB 迁移
│   │   ├── json_datetime.py   # 北京时区 datetime JSON 编码器
│   │   ├── logger.py          # Loguru 日志配置
│   │   ├── models/            # Pydantic 请求/响应模型
│   │   └── routers/           # 每个 API 模块一个文件
│   ├── scripts/               # 一次性迁移脚本
│   └── run.py                 # Uvicorn 启动入口
├── frontend/
│   ├── src/
│   │   ├── api/http.ts        # Axios 实例，自动注入 Auth 头
│   │   ├── stores/auth.ts     # Zustand 认证 store（持久化）
│   │   ├── router/            # React Router 路由定义
│   │   ├── layouts/           # MainLayout、SideMenu
│   │   ├── views/             # 每个页面一个组件
│   │   ├── utils/             # datetime、media、pagination、translateEval
│   │   └── constants/         # 共享选项列表
│   ├── vite.config.ts         # 开发代理、HTTPS 证书配置
│   └── package.json
├── docs/                      # 项目文档
├── uploads/                   # 运行时文件存储（git 忽略）
├── logs/                      # 运行时日志（git 忽略）
├── requirements.txt           # Python 依赖
└── start.sh                   # 生产启动脚本
```

## 后端

### 配置项

所有配置通过 `pydantic-settings` 从 `backend/.env` 读取。复制 `.env.example` 作为起点。

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `MONGODB_URI` | `mongodb://localhost:27017` | MongoDB 连接串 |
| `MONGODB_DB` | `model_eval` | 数据库名 |
| `SECRET_KEY` | *(不安全的默认值)* | JWT 签名密钥——**生产环境必须修改** |
| `ALGORITHM` | `HS256` | JWT 算法 |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `1440` | Token 有效期（24 小时） |
| `UPLOAD_DIR` | `<仓库根目录>/uploads` | 文件存储路径 |
| `UPLOAD_BASE_URL` | `http://localhost:8077` | 上传文件的公开访问基础 URL |
| `MAX_VIDEO_MB` | `1000` | 视频上传大小限制 |
| `MAX_IMAGE_MB` | `100` | 图片上传大小限制 |
| `HOST` | `0.0.0.0` | Uvicorn 监听地址 |
| `PORT` | `8077` | Uvicorn 监听端口 |
| `WORKERS` | `4` | Uvicorn worker 数量 |

### 认证流程

1. `POST /api/auth/login` 返回 JWT。
2. 所有受保护接口需携带 `Authorization: Bearer <token>`。
3. JWT payload 包含 `sub`（用户名）、`role`（角色编码）、`perms`（权限键列表）。
4. `deps.py` 提供 `require_permission(key)` 作为 FastAPI 依赖，验证 token 并检查权限。

### 权限模型

权限为细粒度的键值（如 `material:read`、`eval:write`），在登录时由角色的模块列表通过 `permissions.py` 中的 `expand_modules_to_api_permissions()` 展开，并写入 JWT，使每次请求自包含鉴权信息。

内置角色编码：`admin`、`evaluator`、`rd`、`collector`。

### API 路由

| 前缀 | 路由文件 | 说明 |
|------|----------|------|
| `/api/auth` | `auth.py` | 登录、token 刷新 |
| `/api/users` | `users.py` | 用户 CRUD |
| `/api/roles` | `roles.py` | 角色 CRUD |
| `/api/materials` | `materials.py` | 素材及版本管理、文件上传 |
| `/api/evaluations` | `evaluations.py` | 模板、任务、记录、统计 |
| `/api/robots` | `robots.py` | 机器人 CRUD |
| `/api/device-models` | `device_models.py` | 设备型号 CRUD |
| `/api/apis` | `apis.py` | API 配置管理 |
| `/api/health` | `health.py` | 健康检查 |
| `/*` | `spa.py` | SPA 兜底（托管 `frontend/dist`） |

交互式文档：`/docs`（Swagger）和 `/redoc`。

### 数据库集合

| 集合 | 用途 |
|------|------|
| `users` | 用户账号 |
| `roles` | 角色定义及模块列表 |
| `materials` | 世界模型素材元数据 |
| `material_versions` | 素材版本条目 |
| `eval_templates` | 步骤定义和评分标准 |
| `eval_tasks` | 评测任务实例 |
| `eval_records` | 逐步打分记录 |
| `robots` | 机器人实例 |
| `device_models` | 硬件型号目录 |
| `api_configs` | 外部 API 端点配置 |

`startup.py` 中的迁移在每次启动时自动运行，且为幂等操作。

## 前端

### 开发代理

`vite.config.ts` 将 `/api`、`/static`、`/docs`、`/redoc`、`/openapi.json` 代理到 `http://127.0.0.1:8077`，使前端开发服务器与后端可运行在不同端口而无需处理 CORS。

### 认证 Store

`stores/auth.ts`（Zustand + persist）保存 JWT token 和解码后的用户信息。`api/http.ts` 在每次请求中自动注入 Bearer 头，并在收到 401 时跳转到 `/login`。

### 路由

路由定义在 `router/index.tsx`。所有需认证的路由包裹在 `MainLayout` 中，后者渲染 `SideMenu`。菜单项根据登录时返回的 `modules` 列表过滤显示。

### 前端权限控制

视图组件中的 `canWrite*()` 辅助函数检查 auth store 中的 `perms` 数组，控制写操作按钮（新增/编辑/删除）的显示与隐藏。

## 生产部署

1. 设置强随机 `SECRET_KEY`：`openssl rand -hex 32`
2. 为 MongoDB 配置认证
3. 使用 Nginx 反向代理前后端，统一域名
4. 前端执行 `npm run build`，将 `dist/` 目录交由 Nginx 托管
5. 后端去掉 `--reload`，使用 `supervisor` 或 `systemd` 管理进程
