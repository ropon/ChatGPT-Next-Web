// 静态导出模式下 Server Actions 的 stub 实现
// 在 Tauri 应用中，这些功能由 TauriMcpApi 提供

import {
  McpConfigData,
  ServerStatusResponse,
  DEFAULT_MCP_CONFIG,
} from "./types";

export async function getClientsStatus(): Promise<
  Record<string, ServerStatusResponse>
> {
  return {};
}

export async function getClientTools(_clientId: string) {
  return null;
}

export async function getAvailableClientsCount() {
  return 0;
}

export async function getAllTools() {
  return [];
}

export async function initializeMcpSystem(): Promise<
  McpConfigData | undefined
> {
  return undefined;
}

export async function addMcpServer(
  _clientId: string,
  _config: any,
): Promise<McpConfigData> {
  throw new Error("Server actions not available in export mode");
}

export async function pauseMcpServer(
  _clientId: string,
): Promise<McpConfigData> {
  throw new Error("Server actions not available in export mode");
}

export async function resumeMcpServer(_clientId: string): Promise<void> {
  throw new Error("Server actions not available in export mode");
}

export async function removeMcpServer(
  _clientId: string,
): Promise<McpConfigData> {
  throw new Error("Server actions not available in export mode");
}

export async function restartAllClients(): Promise<McpConfigData> {
  throw new Error("Server actions not available in export mode");
}

export async function executeMcpAction(_clientId: string, _request: any) {
  throw new Error("Server actions not available in export mode");
}

export async function getMcpConfigFromFile(): Promise<McpConfigData> {
  return DEFAULT_MCP_CONFIG;
}

export async function isMcpEnabled() {
  return false;
}
