// MCP API - Tauri 原生实现
// 使用 rmcp (Rust MCP SDK) 作为后端

import {
  McpConfigData,
  ServerConfig,
  ServerStatusResponse,
  ListToolsResponse,
  DEFAULT_MCP_CONFIG,
  McpRequestMessage,
  RuntimeConfig,
  DEFAULT_RUNTIME_CONFIG,
} from "./types";
// Tauri v1 使用 @tauri-apps/api/tauri
import { invoke } from "@tauri-apps/api/tauri";

// 定义 MCP API 接口
export interface McpApi {
  init(): Promise<McpConfigData>;
  getConfig(): Promise<McpConfigData>;
  getConfigPath(): Promise<string>;
  addServer(id: string, config: ServerConfig): Promise<McpConfigData>;
  removeServer(id: string): Promise<McpConfigData>;
  pauseServer(id: string): Promise<McpConfigData>;
  resumeServer(id: string): Promise<McpConfigData>;
  restartAll(): Promise<McpConfigData>;
  getStatuses(): Promise<Record<string, ServerStatusResponse>>;
  getTools(id: string): Promise<ListToolsResponse | null>;
  getAllTools(): Promise<Array<{ clientId: string; tools: ListToolsResponse }>>;
  callTool(
    serverId: string,
    toolName: string,
    args?: Record<string, unknown>,
  ): Promise<any>;
  isEnabled(): Promise<boolean>;
  importConfig(configContent: string): Promise<McpConfigData>;
  exportConfig(): Promise<string>;
  getRuntime(): Promise<RuntimeConfig>;
  setRuntime(runtime: RuntimeConfig): Promise<RuntimeConfig>;
  detectPaths(): Promise<RuntimeConfig>;
}

/**
 * Tauri 原生 MCP API 实现
 * 使用 Rust rmcp SDK 作为后端
 */
export class TauriMcpApi implements McpApi {
  private initialized = false;

  /**
   * 初始化 MCP 系统
   * 加载配置文件并自动连接活跃的服务器
   */
  async init(): Promise<McpConfigData> {
    try {
      const config = await invoke<McpConfigData>("mcp_init");
      this.initialized = true;
      console.log("[MCP] 初始化完成", config);
      return config;
    } catch (e) {
      console.error("[MCP] 初始化失败", e);
      return DEFAULT_MCP_CONFIG;
    }
  }

  /**
   * 获取当前配置
   */
  async getConfig(): Promise<McpConfigData> {
    try {
      return await invoke<McpConfigData>("mcp_get_config");
    } catch (e) {
      console.error("[MCP] 获取配置失败", e);
      return DEFAULT_MCP_CONFIG;
    }
  }

  /**
   * 获取配置文件路径
   */
  async getConfigPath(): Promise<string> {
    try {
      return await invoke<string>("mcp_get_config_path");
    } catch (e) {
      console.error("[MCP] 获取配置路径失败", e);
      return "";
    }
  }

  /**
   * 添加或更新服务器
   */
  async addServer(id: string, config: ServerConfig): Promise<McpConfigData> {
    try {
      return await invoke<McpConfigData>("mcp_add_server", { id, config });
    } catch (e) {
      console.error("[MCP] 添加服务器失败", e);
      throw e;
    }
  }

  /**
   * 移除服务器
   */
  async removeServer(id: string): Promise<McpConfigData> {
    try {
      return await invoke<McpConfigData>("mcp_remove_server", { id });
    } catch (e) {
      console.error("[MCP] 移除服务器失败", e);
      throw e;
    }
  }

  /**
   * 暂停服务器
   */
  async pauseServer(id: string): Promise<McpConfigData> {
    try {
      return await invoke<McpConfigData>("mcp_pause_server", { id });
    } catch (e) {
      console.error("[MCP] 暂停服务器失败", e);
      throw e;
    }
  }

  /**
   * 恢复服务器
   */
  async resumeServer(id: string): Promise<McpConfigData> {
    try {
      return await invoke<McpConfigData>("mcp_resume_server", { id });
    } catch (e) {
      console.error("[MCP] 恢复服务器失败", e);
      throw e;
    }
  }

  /**
   * 重启所有服务器
   */
  async restartAll(): Promise<McpConfigData> {
    try {
      return await invoke<McpConfigData>("mcp_restart_all");
    } catch (e) {
      console.error("[MCP] 重启所有服务器失败", e);
      throw e;
    }
  }

  /**
   * 获取所有服务器状态
   */
  async getStatuses(): Promise<Record<string, ServerStatusResponse>> {
    try {
      return await invoke<Record<string, ServerStatusResponse>>(
        "mcp_get_statuses",
      );
    } catch (e) {
      console.error("[MCP] 获取状态失败", e);
      return {};
    }
  }

  /**
   * 获取服务器的工具列表
   */
  async getTools(id: string): Promise<ListToolsResponse | null> {
    try {
      return await invoke<ListToolsResponse>("mcp_get_tools", { id });
    } catch (e) {
      console.error("[MCP] 获取工具列表失败", e);
      return null;
    }
  }

  /**
   * 获取所有活跃服务器的工具列表
   */
  async getAllTools(): Promise<
    Array<{ clientId: string; tools: ListToolsResponse }>
  > {
    try {
      const result =
        await invoke<Array<[string, ListToolsResponse]>>("mcp_get_all_tools");
      return result.map(([clientId, tools]) => ({ clientId, tools }));
    } catch (e) {
      console.error("[MCP] 获取所有工具失败", e);
      return [];
    }
  }

  /**
   * 调用工具
   */
  async callTool(
    serverId: string,
    toolName: string,
    args?: Record<string, unknown>,
  ): Promise<any> {
    try {
      const response = await invoke<{ result?: any; error?: string }>(
        "mcp_call_tool",
        {
          id: serverId,
          toolName,
          arguments: args,
        },
      );
      if (response.error) {
        throw new Error(response.error);
      }
      return response.result;
    } catch (e) {
      console.error("[MCP] 调用工具失败", e);
      throw e;
    }
  }

  /**
   * 检查 MCP 是否可用
   */
  async isEnabled(): Promise<boolean> {
    try {
      return await invoke<boolean>("mcp_is_enabled");
    } catch (e) {
      console.error("[MCP] 检查可用性失败", e);
      return false;
    }
  }

  /**
   * 导入配置
   */
  async importConfig(configContent: string): Promise<McpConfigData> {
    try {
      return await invoke<McpConfigData>("mcp_import_config", {
        configContent,
      });
    } catch (e) {
      console.error("[MCP] 导入配置失败", e);
      throw e;
    }
  }

  /**
   * 导出配置
   */
  async exportConfig(): Promise<string> {
    try {
      return await invoke<string>("mcp_export_config");
    } catch (e) {
      console.error("[MCP] 导出配置失败", e);
      throw e;
    }
  }

  /**
   * 获取运行时配置
   */
  async getRuntime(): Promise<RuntimeConfig> {
    try {
      return await invoke<RuntimeConfig>("mcp_get_runtime");
    } catch (e) {
      console.error("[MCP] 获取运行时配置失败", e);
      return DEFAULT_RUNTIME_CONFIG;
    }
  }

  /**
   * 设置运行时配置
   */
  async setRuntime(runtime: RuntimeConfig): Promise<RuntimeConfig> {
    try {
      return await invoke<RuntimeConfig>("mcp_set_runtime", { runtime });
    } catch (e) {
      console.error("[MCP] 设置运行时配置失败", e);
      throw e;
    }
  }

  /**
   * 自动检测可执行文件路径
   */
  async detectPaths(): Promise<RuntimeConfig> {
    try {
      return await invoke<RuntimeConfig>("mcp_detect_paths");
    } catch (e) {
      console.error("[MCP] 检测路径失败", e);
      return DEFAULT_RUNTIME_CONFIG;
    }
  }

  /**
   * 获取 MCP 日志
   */
  async getLogs(lines?: number): Promise<string[]> {
    try {
      return await invoke<string[]>("mcp_get_logs", { lines });
    } catch (e) {
      console.error("[MCP] 获取日志失败", e);
      return [];
    }
  }

  /**
   * 清空 MCP 日志
   */
  async clearLogs(): Promise<void> {
    try {
      await invoke("mcp_clear_logs");
    } catch (e) {
      console.error("[MCP] 清空日志失败", e);
    }
  }
}

// 导出单例实例，供 Tauri 应用使用
export const tauriMcpApi = new TauriMcpApi();
