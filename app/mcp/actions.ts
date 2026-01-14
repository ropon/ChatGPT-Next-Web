// MCP Actions - 统一的 MCP 操作接口
// 根据运行环境自动选择 Tauri 后端或 Server Actions

import { tauriMcpApi, TauriMcpApi } from "./api";
import * as ServerActions from "./server-actions";
import {
  ServerConfig,
  McpRequestMessage,
  McpConfigData,
  RuntimeConfig,
  DEFAULT_RUNTIME_CONFIG,
} from "./types";

// 检测是否在 Tauri 环境中运行
const isTauri = () => typeof window !== "undefined" && "__TAURI__" in window;

/**
 * 初始化 MCP 系统
 */
export async function initializeMcpSystem(): Promise<
  McpConfigData | undefined
> {
  if (isTauri()) {
    return tauriMcpApi.init();
  }
  return ServerActions.initializeMcpSystem();
}

/**
 * 获取所有客户端状态
 */
export async function getClientsStatus() {
  if (isTauri()) {
    return tauriMcpApi.getStatuses();
  }
  return ServerActions.getClientsStatus();
}

/**
 * 获取客户端的工具列表
 */
export async function getClientTools(clientId: string) {
  if (isTauri()) {
    return tauriMcpApi.getTools(clientId);
  }
  return ServerActions.getClientTools(clientId);
}

/**
 * 获取可用客户端数量
 */
export async function getAvailableClientsCount() {
  if (isTauri()) {
    const statuses = await tauriMcpApi.getStatuses();
    return Object.values(statuses).filter((s) => s.status === "active").length;
  }
  return ServerActions.getAvailableClientsCount();
}

/**
 * 获取所有工具
 */
export async function getAllTools() {
  if (isTauri()) {
    const result = await tauriMcpApi.getAllTools();
    return result.flatMap(({ clientId, tools }) =>
      tools.tools.map((tool) => ({
        clientId,
        ...tool,
      })),
    );
  }
  return ServerActions.getAllTools();
}

/**
 * 添加 MCP 服务器
 */
export async function addMcpServer(clientId: string, config: ServerConfig) {
  if (isTauri()) {
    return tauriMcpApi.addServer(clientId, config);
  }
  return ServerActions.addMcpServer(clientId, config);
}

/**
 * 暂停 MCP 服务器
 */
export async function pauseMcpServer(clientId: string) {
  if (isTauri()) {
    return tauriMcpApi.pauseServer(clientId);
  }
  return ServerActions.pauseMcpServer(clientId);
}

/**
 * 恢复 MCP 服务器
 */
export async function resumeMcpServer(clientId: string) {
  if (isTauri()) {
    return tauriMcpApi.resumeServer(clientId);
  }
  return ServerActions.resumeMcpServer(clientId);
}

/**
 * 移除 MCP 服务器
 */
export async function removeMcpServer(clientId: string) {
  if (isTauri()) {
    return tauriMcpApi.removeServer(clientId);
  }
  return ServerActions.removeMcpServer(clientId);
}

/**
 * 重启所有客户端
 */
export async function restartAllClients() {
  if (isTauri()) {
    return tauriMcpApi.restartAll();
  }
  return ServerActions.restartAllClients();
}

/**
 * 执行 MCP 工具调用
 */
export async function executeMcpAction(
  clientId: string,
  request: McpRequestMessage,
) {
  if (isTauri()) {
    // 从 request 中提取工具名和参数
    const toolName = request.params?.name as string;
    const args = request.params?.arguments as Record<string, unknown>;
    return tauriMcpApi.callTool(clientId, toolName, args);
  }
  return ServerActions.executeMcpAction(clientId, request);
}

/**
 * 获取 MCP 配置
 */
export async function getMcpConfigFromFile() {
  if (isTauri()) {
    return tauriMcpApi.getConfig();
  }
  return ServerActions.getMcpConfigFromFile();
}

/**
 * 检查 MCP 是否可用
 */
export async function isMcpEnabled() {
  if (isTauri()) {
    return tauriMcpApi.isEnabled();
  }

  // 对于静态导出构建，访问服务器配置可能失败
  try {
    return await ServerActions.isMcpEnabled();
  } catch {
    return false;
  }
}

/**
 * 获取配置文件路径 (仅 Tauri)
 */
export async function getMcpConfigPath(): Promise<string> {
  if (isTauri()) {
    return tauriMcpApi.getConfigPath();
  }
  return "";
}

/**
 * 导入配置 (仅 Tauri)
 */
export async function importMcpConfig(
  configContent: string,
): Promise<McpConfigData | undefined> {
  if (isTauri()) {
    return tauriMcpApi.importConfig(configContent);
  }
  return undefined;
}

/**
 * 导出配置 (仅 Tauri)
 */
export async function exportMcpConfig(): Promise<string> {
  if (isTauri()) {
    return tauriMcpApi.exportConfig();
  }
  return "";
}

/**
 * 获取运行时配置 (仅 Tauri)
 */
export async function getMcpRuntime(): Promise<RuntimeConfig> {
  if (isTauri()) {
    return tauriMcpApi.getRuntime();
  }
  return DEFAULT_RUNTIME_CONFIG;
}

/**
 * 设置运行时配置 (仅 Tauri)
 */
export async function setMcpRuntime(
  runtime: RuntimeConfig,
): Promise<RuntimeConfig> {
  if (isTauri()) {
    return tauriMcpApi.setRuntime(runtime);
  }
  return DEFAULT_RUNTIME_CONFIG;
}

/**
 * 自动检测可执行文件路径 (仅 Tauri)
 */
export async function detectMcpPaths(): Promise<RuntimeConfig> {
  if (isTauri()) {
    return tauriMcpApi.detectPaths();
  }
  return DEFAULT_RUNTIME_CONFIG;
}
