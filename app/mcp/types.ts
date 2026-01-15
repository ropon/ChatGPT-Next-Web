// ref: https://spec.modelcontextprotocol.io/specification/basic/messages/

import { z } from "zod";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";

export interface McpRequestMessage {
  jsonrpc?: "2.0";
  id?: string | number;
  method: "tools/call" | string;
  params?: {
    [key: string]: unknown;
  };
}

export const McpRequestMessageSchema: z.ZodType<McpRequestMessage> = z.object({
  jsonrpc: z.literal("2.0").optional(),
  id: z.union([z.string(), z.number()]).optional(),
  method: z.string(),
  params: z.record(z.unknown()).optional(),
});

export interface McpResponseMessage {
  jsonrpc?: "2.0";
  id?: string | number;
  result?: {
    [key: string]: unknown;
  };
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export const McpResponseMessageSchema: z.ZodType<McpResponseMessage> = z.object(
  {
    jsonrpc: z.literal("2.0").optional(),
    id: z.union([z.string(), z.number()]).optional(),
    result: z.record(z.unknown()).optional(),
    error: z
      .object({
        code: z.number(),
        message: z.string(),
        data: z.unknown().optional(),
      })
      .optional(),
  },
);

export interface McpNotifications {
  jsonrpc?: "2.0";
  method: string;
  params?: {
    [key: string]: unknown;
  };
}

export const McpNotificationsSchema: z.ZodType<McpNotifications> = z.object({
  jsonrpc: z.literal("2.0").optional(),
  method: z.string(),
  params: z.record(z.unknown()).optional(),
});

////////////
// Next Chat
////////////
export interface ToolInfo {
  name: string;
  description?: string;
  inputSchema?: object;
  [key: string]: any;
}

export interface ListToolsResponse {
  tools: ToolInfo[];
}

export type McpClientData =
  | McpActiveClient
  | McpErrorClient
  | McpInitializingClient;

interface McpInitializingClient {
  client: null;
  tools: null;
  errorMsg: null;
}

interface McpActiveClient {
  client: Client;
  tools: ListToolsResponse;
  errorMsg: null;
}

interface McpErrorClient {
  client: null;
  tools: null;
  errorMsg: string;
}

// 服务器状态类型
export type ServerStatus =
  | "undefined"
  | "active"
  | "paused"
  | "error"
  | "initializing";

export interface ServerStatusResponse {
  status: ServerStatus;
  errorMsg: string | null;
}

// MCP 服务器配置相关类型
// Stdio 类型配置
export interface StdioServerConfig {
  type?: "stdio"; // 默认类型，可省略
  command: string;
  args: string[];
  env?: Record<string, string>;
  status?: "active" | "paused" | "error";
}

// SSE 类型配置
export interface SSEServerConfig {
  type: "sse";
  url: string;
  headers?: Record<string, string>;
  status?: "active" | "paused" | "error";
}

// HTTP 类型配置（Streamable HTTP）
export interface HTTPServerConfig {
  type: "http";
  url: string;
  headers?: Record<string, string>;
  status?: "active" | "paused" | "error";
}

export type ServerConfig =
  | StdioServerConfig
  | SSEServerConfig
  | HTTPServerConfig;

// 类型守卫
export function isSSEConfig(config: ServerConfig): config is SSEServerConfig {
  return config.type === "sse";
}

export function isHTTPConfig(config: ServerConfig): config is HTTPServerConfig {
  return config.type === "http";
}

export function isStdioConfig(
  config: ServerConfig,
): config is StdioServerConfig {
  return config.type === "stdio" || config.type === undefined;
}

export interface McpConfigData {
  // MCP Server 的配置
  mcpServers: Record<string, ServerConfig>;
}

// 运行时环境配置
export interface RuntimeConfig {
  nodePath?: string;
  npxPath?: string;
  uvxPath?: string;
  extraPath?: string;
}

export const DEFAULT_MCP_CONFIG: McpConfigData = {
  mcpServers: {},
};

export const DEFAULT_RUNTIME_CONFIG: RuntimeConfig = {
  nodePath: undefined,
  npxPath: undefined,
  uvxPath: undefined,
  extraPath: undefined,
};

export interface ArgsMapping {
  // 参数映射的类型
  type: "spread" | "single" | "env";

  // 参数映射的位置
  position?: number;

  // 参数映射的 key
  key?: string;
}

export interface PresetServer {
  // MCP Server 的唯一标识，作为最终配置文件 Json 的 key
  id: string;

  // MCP Server 的显示名称
  name: string;

  // MCP Server 的描述
  description: string;

  // MCP Server 的仓库地址
  repo: string;

  // MCP Server 的标签
  tags: string[];

  // MCP Server 的命令
  command: string;

  // MCP Server 的参数
  baseArgs: string[];

  // MCP Server 是否需要配置
  configurable: boolean;

  // MCP Server 的配置 schema
  configSchema?: {
    properties: Record<
      string,
      {
        type: string;
        description?: string;
        required?: boolean;
        minItems?: number;
      }
    >;
  };

  // MCP Server 的参数映射
  argsMapping?: Record<string, ArgsMapping>;
}
