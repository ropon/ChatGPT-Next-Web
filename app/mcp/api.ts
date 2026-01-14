
import { 
  McpConfigData, 
  ServerConfig, 
  ServerStatusResponse,
  ListToolsResponse,
  DEFAULT_MCP_CONFIG,
  McpRequestMessage
} from "./types";
import { invoke } from "@tauri-apps/api/core";
// If core is not available, try @tauri-apps/api (auto-detect not easy, assume v2 based on package.json)
// Fallback type check or just use 'any' if types are missing for now.

// Interface defining all MCP operations
export interface McpApi {
  init(): Promise<void>;
  getConfig(): Promise<McpConfigData>;
  addServer(id: string, config: ServerConfig): Promise<McpConfigData>;
  removeServer(id: string): Promise<McpConfigData>;
  pauseServer(id: string): Promise<McpConfigData>;
  resumeServer(id: string): Promise<void>;
  restartAll(): Promise<McpConfigData>;
  getStatuses(): Promise<Record<string, ServerStatusResponse>>;
  getTools(id: string): Promise<ListToolsResponse | null>;
  callTool(serverId: string, request: McpRequestMessage): Promise<any>;
  isEnabled(): Promise<boolean>;
}

// Local Storage Key for Tauri App
const STORAGE_KEY = "mcp_config";

// Implementation for Tauri App
export class TauriMcpApi implements McpApi {
  private config: McpConfigData = DEFAULT_MCP_CONFIG;
  private statuses: Record<string, ServerStatusResponse> = {};

  async init(): Promise<void> {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        this.config = JSON.parse(saved);
      } catch (e) {
        console.error("Failed to parse MCP config", e);
      }
    }
    
    // Auto-connect active servers
    for (const [id, server] of Object.entries(this.config.mcpServers)) {
      if (server.status === "active") {
        await this.connect(id, server);
      } else {
        this.statuses[id] = { status: server.status || "paused", errorMsg: null };
      }
    }
  }

  private async saveConfig() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.config));
  }

  private async connect(id: string, config: ServerConfig) {
    this.statuses[id] = { status: "initializing", errorMsg: null };
    try {
      await invoke("mcp_connect", { id, config });
      this.statuses[id] = { status: "active", errorMsg: null };
    } catch (e) {
      this.statuses[id] = { status: "error", errorMsg: String(e) };
      console.error(`Failed to connect to ${id}`, e);
    }
  }

  async getConfig(): Promise<McpConfigData> {
    return this.config;
  }

  async addServer(id: string, config: ServerConfig): Promise<McpConfigData> {
    this.config.mcpServers[id] = { ...config, status: "active" };
    await this.saveConfig();
    await this.connect(id, config);
    return this.config;
  }

  async removeServer(id: string): Promise<McpConfigData> {
    delete this.config.mcpServers[id];
    await this.saveConfig();
    await invoke("mcp_disconnect", { id }).catch(console.error);
    delete this.statuses[id];
    return this.config;
  }

  async pauseServer(id: string): Promise<McpConfigData> {
    const server = this.config.mcpServers[id];
    if (server) {
      server.status = "paused";
      await this.saveConfig();
      await invoke("mcp_disconnect", { id }).catch(console.error);
      this.statuses[id] = { status: "paused", errorMsg: null };
    }
    return this.config;
  }

  async resumeServer(id: string): Promise<void> {
    const server = this.config.mcpServers[id];
    if (server) {
      server.status = "active";
      await this.saveConfig();
      await this.connect(id, server);
    }
  }

  async restartAll(): Promise<McpConfigData> {
    // Disconnect all first
    for (const id of Object.keys(this.statuses)) {
        await invoke("mcp_disconnect", { id }).catch(() => {});
    }
    await this.init();
    return this.config;
  }

  async getStatuses(): Promise<Record<string, ServerStatusResponse>> {
    return this.statuses;
  }

  async getAllTools(): Promise<Array<{ clientId: string; tools: ListToolsResponse['tools'] }>> {
    const result = [];
    for (const [id, status] of Object.entries(this.statuses)) {
        if (status.status === 'active') {
            const toolsResp = await this.getTools(id);
            if (toolsResp && toolsResp.tools) {
                result.push({
                    clientId: id,
                    tools: toolsResp.tools
                });
            }
        }
    }
    return result;
  }

  async getTools(id: string): Promise<ListToolsResponse | null> {
    try {
      const response = await invoke<any>("mcp_send_request", {
        id,
        request: {
          jsonrpc: "2.0",
          method: "tools/list",
          id: 1 // arbitrary ID for waiting
        }
      });
      if (response.result) {
        return response.result as ListToolsResponse;
      }
    } catch (e) {
      console.error("Failed to list tools", e);
    }
    return null;
  }

  async callTool(serverId: string, request: McpRequestMessage): Promise<any> {
      const response = await invoke<any>("mcp_send_request", {
          id: serverId,
          request
      });
      return response;
  }

  async isEnabled(): Promise<boolean> {
      return true;
  }
}
