import { spawn, ChildProcessWithoutNullStreams } from "node:child_process";
import { MCPServerConfig } from "../../config/config.js";

export enum MCPServerStatus {
  DISCONNECTED = "disconnected",
  CONNECTING = "connecting",
  CONNECTED = "connected",
  ERROR = "error",
}

export interface MCPToolInfo {
  name: string;
  description: string;
  inputSchema?: Record<string, any>;
  serverName?: string;
}

interface JsonRpcResponse {
  id: number;
  result?: any;
  error?: { message: string };
}

export class MCPClient {
  name: string;
  config: MCPServerConfig;
  cwd: string;
  status: MCPServerStatus = MCPServerStatus.DISCONNECTED;
  private toolsMap = new Map<string, MCPToolInfo>();
  private child?: ChildProcessWithoutNullStreams;
  private jsonRpcId = 1;

  constructor(name: string, config: MCPServerConfig, cwd: string) {
    this.name = name;
    this.config = config;
    this.cwd = cwd;
  }

  get tools(): MCPToolInfo[] {
    return Array.from(this.toolsMap.values());
  }

  async connect(): Promise<void> {
    if (this.status === MCPServerStatus.CONNECTED) {
      return;
    }

    this.status = MCPServerStatus.CONNECTING;
    try {
      if (this.config.command) {
        await this.connectStdio();
      } else if (this.config.url) {
        await this.connectHttp();
      }
      this.status = MCPServerStatus.CONNECTED;
    } catch (error) {
      this.status = MCPServerStatus.ERROR;
      throw error;
    }
  }

  private async connectHttp(): Promise<void> {
    const response = await fetch(`${this.config.url}/tools`);
    if (!response.ok) {
      throw new Error(`MCP server responded with ${response.status}`);
    }
    const payload = (await response.json()) as { tools?: MCPToolInfo[] };
    for (const tool of payload.tools ?? []) {
      this.toolsMap.set(tool.name, { ...tool, serverName: this.name });
    }
  }

  private async connectStdio(): Promise<void> {
    const env = { ...process.env, ...this.config.env } as NodeJS.ProcessEnv;
    this.child = spawn(this.config.command!, this.config.args ?? [], {
      cwd: this.config.cwd ?? this.cwd,
      env,
      stdio: "pipe",
    });

    const response = await this.sendJsonRpc("tools/list", {});
    const tools = response?.result?.tools ?? [];
    for (const tool of tools) {
      this.toolsMap.set(tool.name, {
        name: tool.name,
        description: tool.description ?? "",
        inputSchema: tool.inputSchema ?? tool.input_schema ?? {},
        serverName: this.name,
      });
    }
  }

  async disconnect(): Promise<void> {
    if (this.child) {
      this.child.kill();
      this.child = undefined;
    }
    this.toolsMap.clear();
    this.status = MCPServerStatus.DISCONNECTED;
  }

  async callTool(toolName: string, argumentsPayload: Record<string, any>) {
    if (this.config.url) {
      const response = await fetch(`${this.config.url}/tools/${encodeURIComponent(toolName)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ arguments: argumentsPayload }),
      });
      if (!response.ok) {
        throw new Error(`MCP tool call failed: ${response.status}`);
      }
      return response.json();
    }

    const response = await this.sendJsonRpc("tools/call", { name: toolName, arguments: argumentsPayload });
    return response?.result ?? {};
  }

  private sendJsonRpc(method: string, params: Record<string, any>): Promise<JsonRpcResponse> {
    return new Promise((resolve, reject) => {
      if (!this.child) {
        reject(new Error("MCP client not connected"));
        return;
      }

      const id = this.jsonRpcId++;
      const payload = JSON.stringify({ jsonrpc: "2.0", id, method, params });
      this.child.stdin.write(`${payload}\n`);

      const handleData = (data: Buffer) => {
        const lines = data.toString().split(/\r?\n/).filter(Boolean);
        for (const line of lines) {
          try {
            const response = JSON.parse(line) as JsonRpcResponse;
            if (response.id === id) {
              this.child?.stdout.off("data", handleData);
              if (response.error) {
                reject(new Error(response.error.message));
              } else {
                resolve(response);
              }
              return;
            }
          } catch (error) {
            continue;
          }
        }
      };

      this.child.stdout.on("data", handleData);
    });
  }
}
