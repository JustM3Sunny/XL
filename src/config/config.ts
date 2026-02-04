import path from "node:path";

export interface ModelConfig {
  name: string;
  temperature: number;
  contextWindow: number;
}

export interface ShellEnvironmentPolicy {
  ignoreDefaultExcludes: boolean;
  excludePatterns: string[];
  setVars: Record<string, string>;
}

export interface MCPServerConfig {
  enabled: boolean;
  startupTimeoutSec: number;
  command?: string;
  args: string[];
  env: Record<string, string>;
  cwd?: string;
  url?: string;
}

export enum ApprovalPolicy {
  ON_REQUEST = "on-request",
  ON_FAILURE = "on-failure",
  AUTO = "auto",
  AUTO_EDIT = "auto-edit",
  NEVER = "never",
  YOLO = "yolo",
}

export enum HookTrigger {
  BEFORE_AGENT = "before_agent",
  AFTER_AGENT = "after_agent",
  BEFORE_TOOL = "before_tool",
  AFTER_TOOL = "after_tool",
  ON_ERROR = "on_error",
}

export interface HookConfig {
  name: string;
  trigger: HookTrigger;
  command?: string;
  script?: string;
  timeoutSec: number;
  enabled: boolean;
}

export interface ConfigOptions {
  provider?: ProviderName;
  model?: Partial<ModelConfig>;
  cwd?: string;
  shellEnvironment?: Partial<ShellEnvironmentPolicy>;
  hooksEnabled?: boolean;
  hooks?: HookConfig[];
  approval?: ApprovalPolicy;
  maxTurns?: number;
  mcpServers?: Record<string, MCPServerConfig>;
  allowedTools?: string[] | null;
  developerInstructions?: string | null;
  userInstructions?: string | null;
  debug?: boolean;
}

export class Config {
  provider: ProviderName;
  model: ModelConfig;
  cwd: string;
  shellEnvironment: ShellEnvironmentPolicy;
  hooksEnabled: boolean;
  hooks: HookConfig[];
  approval: ApprovalPolicy;
  maxTurns: number;
  mcpServers: Record<string, MCPServerConfig>;
  allowedTools?: string[] | null;
  developerInstructions?: string | null;
  userInstructions?: string | null;
  debug: boolean;

  constructor(options: ConfigOptions = {}) {
    const modelDefaults: ModelConfig = {
      name: "gemini-2.5-flash-lite",
      temperature: 1,
      contextWindow: 256_000,
    };

    this.provider = options.provider ?? "gemini";
    this.model = {
      ...modelDefaults,
      ...options.model,
    };

    this.cwd = options.cwd ? path.resolve(options.cwd) : process.cwd();
    this.shellEnvironment = {
      ignoreDefaultExcludes: options.shellEnvironment?.ignoreDefaultExcludes ?? false,
      excludePatterns: options.shellEnvironment?.excludePatterns ?? ["*KEY*", "*TOKEN*", "*SECRET*"],
      setVars: options.shellEnvironment?.setVars ?? {},
    };
    this.hooksEnabled = options.hooksEnabled ?? false;
    this.hooks = options.hooks ?? [];
    this.approval = options.approval ?? ApprovalPolicy.ON_REQUEST;
    this.maxTurns = options.maxTurns ?? 100;
    this.mcpServers = options.mcpServers ?? {};
    this.allowedTools = options.allowedTools ?? null;
    this.developerInstructions = options.developerInstructions ?? null;
    this.userInstructions = options.userInstructions ?? null;
    this.debug = options.debug ?? false;
  }

  get apiKey(): string | undefined {
    return process.env.API_KEY;
  }

  get geminiApiKey(): string | undefined {
    return process.env.GEMINI_API_KEY ?? process.env.API_KEY;
  }

  get groqApiKey(): string | undefined {
    return process.env.GROQ_API_KEY ?? process.env.API_KEY;
  }

  get baseUrl(): string | undefined {
    return process.env.BASE_URL;
  }

  get modelName(): string {
    return this.model.name;
  }

  set modelName(value: string) {
    this.model.name = value;
  }

  get temperature(): number {
    return this.model.temperature;
  }

  set temperature(value: number) {
    this.model.temperature = value;
  }

  validate(): string[] {
    const errors: string[] = [];

    if (!["gemini", "groq"].includes(this.provider)) {
      errors.push(`Unsupported provider: ${this.provider}`);
    }

    if (this.provider === "gemini" && !this.geminiApiKey) {
      errors.push("No Gemini API key found. Set GEMINI_API_KEY (or API_KEY) environment variable");
    }

    if (this.provider === "groq" && !this.groqApiKey) {
      errors.push("No Groq API key found. Set GROQ_API_KEY (or API_KEY) environment variable");
    }

    if (!this.cwd || !path.isAbsolute(this.cwd)) {
      errors.push(`Working directory is not valid: ${this.cwd}`);
    }

    return errors;
  }

  toJSON(): Record<string, unknown> {
    return {
      provider: this.provider,
      model: this.model,
      cwd: this.cwd,
      shellEnvironment: this.shellEnvironment,
      hooksEnabled: this.hooksEnabled,
      hooks: this.hooks,
      approval: this.approval,
      maxTurns: this.maxTurns,
      mcpServers: this.mcpServers,
      allowedTools: this.allowedTools,
      developerInstructions: this.developerInstructions,
      userInstructions: this.userInstructions,
      debug: this.debug,
    };
  }
}

export type ProviderName = "gemini" | "groq";

export function validateMcpConfig(config: MCPServerConfig): void {
  const hasCommand = Boolean(config.command);
  const hasUrl = Boolean(config.url);

  if (!hasCommand && !hasUrl) {
    throw new Error("MCP Server must have either 'command' (stdio) or 'url' (http/sse)");
  }

  if (hasCommand && hasUrl) {
    throw new Error("MCP Server cannot have both 'command' (stdio) and 'url' (http/sse)");
  }
}
