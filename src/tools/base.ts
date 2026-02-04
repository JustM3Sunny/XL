import { Config } from "../config/config.js";
import { createHash } from "node:crypto";
import { diffLines } from "diff";

export enum ToolKind {
  READ = "read",
  WRITE = "write",
  SHELL = "shell",
  NETWORK = "network",
  MEMORY = "memory",
  MCP = "mcp",
}

export interface FileDiff {
  path: string;
  oldContent: string;
  newContent: string;
  isNewFile?: boolean;
  isDeletion?: boolean;
  toDiff(): string;
}

export class UnifiedFileDiff implements FileDiff {
  path: string;
  oldContent: string;
  newContent: string;
  isNewFile?: boolean;
  isDeletion?: boolean;

  constructor(options: { path: string; oldContent: string; newContent: string; isNewFile?: boolean; isDeletion?: boolean }) {
    this.path = options.path;
    this.oldContent = options.oldContent;
    this.newContent = options.newContent;
    this.isNewFile = options.isNewFile ?? false;
    this.isDeletion = options.isDeletion ?? false;
  }

  toDiff(): string {
    const oldName = this.isNewFile ? "/dev/null" : this.path;
    const newName = this.isDeletion ? "/dev/null" : this.path;

    const oldLines = this.oldContent.split("\n");
    const newLines = this.newContent.split("\n");
    const diff = diffLines(oldLines.join("\n"), newLines.join("\n")) as Array<{
      added?: boolean;
      removed?: boolean;
      value: string;
    }>;

    const header = `--- ${oldName}\n+++ ${newName}\n`;
    const chunks = diff
      .map((part) => {
        const prefix = part.added ? "+" : part.removed ? "-" : " ";
        return part.value
          .split("\n")
          .filter((line) => line.length > 0)
          .map((line) => `${prefix}${line}`)
          .join("\n");
      })
      .filter(Boolean)
      .join("\n");

    return `${header}${chunks}\n`;
  }
}

export interface ToolResult {
  success: boolean;
  output: string;
  error?: string | null;
  metadata?: Record<string, any>;
  truncated?: boolean;
  diff?: FileDiff | null;
  exitCode?: number | null;
}

export const ToolResultFactory = {
  error(error: string, output = "", extra: Partial<ToolResult> = {}): ToolResult {
    return {
      success: false,
      output,
      error,
      metadata: extra.metadata ?? {},
      truncated: extra.truncated ?? false,
      diff: extra.diff ?? null,
      exitCode: extra.exitCode ?? null,
    };
  },
  success(output: string, extra: Partial<ToolResult> = {}): ToolResult {
    return {
      success: true,
      output,
      error: null,
      metadata: extra.metadata ?? {},
      truncated: extra.truncated ?? false,
      diff: extra.diff ?? null,
      exitCode: extra.exitCode ?? null,
    };
  },
};

export interface ToolInvocation {
  params: Record<string, any>;
  cwd: string;
}

export interface ToolConfirmation {
  toolName: string;
  params: Record<string, any>;
  description: string;
  diff?: FileDiff | null;
  affectedPaths?: string[];
  command?: string | null;
  isDangerous?: boolean;
}

export interface ToolSchema {
  name: string;
  description: string;
  parameters: Record<string, any>;
  required?: string[];
}

export abstract class Tool {
  abstract name: string;
  abstract description: string;
  kind: ToolKind = ToolKind.READ;

  protected config: Config;

  constructor(config: Config) {
    this.config = config;
  }

  abstract get schema(): ToolSchema | Record<string, any>;

  abstract execute(invocation: ToolInvocation): Promise<ToolResult>;

  validateParams(params: Record<string, any>): string[] {
    const schema = this.schema as ToolSchema;
    const required = schema.required ?? schema.parameters?.required ?? [];
    const errors: string[] = [];

    for (const field of required) {
      if (params[field] === undefined || params[field] === null) {
        errors.push(`Parameter '${field}' is required`);
      }
    }

    return errors;
  }

  isMutating(): boolean {
    return [ToolKind.WRITE, ToolKind.SHELL, ToolKind.NETWORK, ToolKind.MEMORY].includes(this.kind);
  }

  async getConfirmation(invocation: ToolInvocation): Promise<ToolConfirmation | null> {
    if (!this.isMutating()) {
      return null;
    }

    return {
      toolName: this.name,
      params: invocation.params,
      description: `Execute ${this.name}`,
    };
  }

  toOpenAISchema(): Record<string, any> {
    const schema = this.schema as ToolSchema;
    if (schema.parameters) {
      return {
        name: this.name,
        description: this.description,
        parameters: schema.parameters,
      };
    }

    return {
      name: this.name,
      description: this.description,
      parameters: schema,
    };
  }

  protected stableHash(content: string): string {
    return createHash("sha256").update(content).digest("hex");
  }
}
