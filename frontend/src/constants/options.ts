export const ROLE_MODULE_OPTIONS: { value: string; label: string }[] = [
  { value: "roles", label: "角色管理" },
  { value: "users", label: "账号管理" },
  { value: "materials", label: "素材库" },
  { value: "eval", label: "评测任务" },
  { value: "eval_templates", label: "评测模板" },
  { value: "device_models", label: "设备型号" },
  { value: "robots", label: "机器人管理" },
  { value: "api_docs", label: "接口文档" },
];

export const ROBOT_STATUS = ["在线", "离线", "故障"];
export const DEVICE_MODEL_STATUS = ["启用", "停用"];
export const MATERIAL_TYPES = ["原子任务", "长程任务", "PR任务", "试采集任务", "榜单任务"];
export const MATERIAL_STATUS = ["备选中", "进行中", "已完成", "已丢弃"];
export const EVAL_TASK_TYPES = ["实验任务", "PR任务"];
export const EVAL_TASK_STATUS = ["已完成", "进行中", "待评测"];
export const EVAL_RECORD_RESULT = ["成功", "失败"];
export const EVAL_RECORD_STATUS = ["有效", "剔除"];
export const EVAL_TEMPLATE_STATUS = ["启用", "停用"];
