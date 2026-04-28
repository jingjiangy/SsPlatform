/** 角色可勾选的系统模块（与后端 app.permissions.VALID_MODULES 一致） */
export const ROLE_MODULE_OPTIONS: { value: string; label: string }[] = [
  { value: "roles", label: "角色管理" },
  { value: "users", label: "账号管理" },
  { value: "materials", label: "素材库" },
  { value: "eval", label: "评测管理" },
  { value: "device_models", label: "设备型号" },
  { value: "robots", label: "机器人管理" },
  { value: "parts", label: "配件管理" },
  { value: "fault_records", label: "故障记录" },
  { value: "api_docs", label: "接口文档" },
];

/** 机器人状态（与后端 model_ss / RobotCreate 校验一致） */
export const ROBOT_STATUS = ["在线", "离线", "故障"];

/** 配件状态（与 backend PART_STATUSES 一致） */
export const PART_STATUS = ["在线", "离线", "故障"];

/** 设备型号状态（与 backend DEVICE_MODEL_STATUSES 一致） */
export const DEVICE_MODEL_STATUS = ["启用", "停用"];

/** 故障记录状态（与 backend FAULT_STATUSES 一致） */
export const FAULT_STATUS = ["待处理", "处理中", "已关闭"];

export const MATERIAL_TYPES = ["原子任务", "长程任务", "PR任务", "试采集任务"];
export const MATERIAL_STATUS = ["搁置", "进行中", "测试中", "丢弃", "PR已布", "可备用"];
export const EVAL_TASK_TYPES = ["实验任务", "PR任务"];
export const EVAL_TASK_STATUS = ["已完成", "进行中", "待评测"];
export const EVAL_RECORD_RESULT = ["成功", "失败"];
export const EVAL_TEMPLATE_STATUS = ["进行中", "启用", "停用"];
