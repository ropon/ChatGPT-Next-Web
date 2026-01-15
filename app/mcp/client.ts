import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { MCPClientLogger } from "./logger";
import {
  ListToolsResponse,
  McpRequestMessage,
  ServerConfig,
  isSSEConfig,
  isStdioConfig,
} from "./types";
import { z } from "zod";

const logger = new MCPClientLogger();

export async function createClient(
  id: string,
  config: ServerConfig,
): Promise<Client> {
  logger.info(`Creating client for ${id}...`);

  let transport;

  if (isSSEConfig(config)) {
    // SSE 传输
    logger.info(`Using SSE transport for ${id}, URL: ${config.url}`);
    transport = new SSEClientTransport(new URL(config.url), {
      requestInit: {
        headers: config.headers || {},
      },
    });
  } else if (isStdioConfig(config)) {
    // Stdio 传输
    logger.info(`Using Stdio transport for ${id}`);
    transport = new StdioClientTransport({
      command: config.command,
      args: config.args,
      env: {
        ...Object.fromEntries(
          Object.entries(process.env)
            .filter(([_, v]) => v !== undefined)
            .map(([k, v]) => [k, v as string]),
        ),
        ...(config.env || {}),
      },
    });
  } else {
    throw new Error(`Unknown transport type for client ${id}`);
  }

  const client = new Client(
    {
      name: `nextchat-mcp-client-${id}`,
      version: "1.0.0",
    },
    {
      capabilities: {},
    },
  );
  await client.connect(transport);
  return client;
}

export async function removeClient(client: Client) {
  logger.info(`Removing client...`);
  await client.close();
}

export async function listTools(client: Client): Promise<ListToolsResponse> {
  return client.listTools();
}

export async function executeRequest(
  client: Client,
  request: McpRequestMessage,
) {
  return client.request(request, z.any());
}
