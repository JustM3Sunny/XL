import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { Tool, ToolConfirmation, ToolInvocation, ToolKind, ToolResult, ToolResultFactory } from "../base.js";

const BLOCKED_COMMANDS = [
  "rm -rf /",
  "rm -rf ~",
  "rm -rf /*",
  "dd if=/dev/zero",
  "dd if=/dev/random",
  "mkfs",
  "fdisk",
  "parted",
  ":(){ :|:& };:",
  "chmod 777 /",
  "chmod -R 777",
  "shutdown",
  "reboot",
  "halt",
  "poweroff",
  "init 0",
  "init 6",
];

export class ShellTool extends Tool {
  name = "shell";
  description = "Execute a shell command. Use this for running system commands, scripts and CLI tools.";
  kind = ToolKind.SHELL;

  get schema() {
    return {
      name: this.name,
      description: this.description,
      parameters: {
        type: "object",
        properties: {
          command: {
            type: "string",
            description: "The shell command to execute",
          },
          timeout: {
            type: "integer",
            minimum: 1,
            maximum: 600,
            description: "Timeout in seconds (default: 120)",
          },
          cwd: {
            type: "string",
            description: "Working directory for the command",
          },
        },
        required: ["command"],
      },
    };
  }

  async getConfirmation(invocation: ToolInvocation): Promise<ToolConfirmation | null> {
    const params = invocation.params as { command: string };
    for (const blocked of BLOCKED_COMMANDS) {
      if (params.command.includes(blocked)) {
        return {
          toolName: this.name,
          params: invocation.params,
          description: `Execute (BLOCKED): ${params.command}`,
          command: params.command,
          isDangerous: true,
        };
      }
    }

    return {
      toolName: this.name,
      params: invocation.params,
      description: `Execute: ${params.command}`,
      command: params.command,
      isDangerous: false,
    };
  }

  async execute(invocation: ToolInvocation) {
    const params = invocation.params as { command: string; timeout?: number; cwd?: string };
    const command = params.command.trim();

    for (const blocked of BLOCKED_COMMANDS) {
      if (command.includes(blocked)) {
        return ToolResultFactory.error(`Command blocked for safety: ${command}`, "", { metadata: { blocked: true } });
      }
    }

    const cwd = params.cwd ? (path.isAbsolute(params.cwd) ? params.cwd : path.resolve(invocation.cwd, params.cwd)) : invocation.cwd;
    if (!fs.existsSync(cwd)) {
      return ToolResultFactory.error(`Working directory doesn't exist: ${cwd}`);
    }

    const env = this.buildEnvironment();
    const timeoutSec = params.timeout ?? 120;

    return new Promise<ToolResult>((resolve) => {
      const child = spawn(command, {
        shell: true,
        cwd,
        env,
        detached: process.platform !== "win32",
      });

      let stdout = "";
      let stderr = "";

      child.stdout?.on("data", (data) => {
        stdout += data.toString();
      });
      child.stderr?.on("data", (data) => {
        stderr += data.toString();
      });

      const timeout = setTimeout(() => {
        if (process.platform !== "win32") {
          process.kill(-child.pid, "SIGKILL");
        } else {
          child.kill("SIGKILL");
        }
        resolve(ToolResultFactory.error(`Command timed out after ${timeoutSec}s`));
      }, timeoutSec * 1000);

      child.on("exit", (code) => {
        clearTimeout(timeout);
        let output = "";
        if (stdout.trim()) {
          output += stdout.trimEnd();
        }
        if (stderr.trim()) {
          output += `\n--- stderr ---\n${stderr.trimEnd()}`;
        }
        if (code && code !== 0) {
          output += `\nExit code: ${code}`;
        }

        if (output.length > 100 * 1024) {
          output = `${output.slice(0, 100 * 1024)}\n... [output truncated]`;
        }

        resolve({
          success: code === 0,
          output,
          error: code === 0 ? null : stderr.trim() || `Exit code: ${code}`,
          exitCode: code ?? 0,
        });
      });
    });
  }

  private buildEnvironment(): Record<string, string> {
    const env = { ...process.env } as Record<string, string>;
    const policy = this.config.shellEnvironment;

    if (!policy.ignoreDefaultExcludes) {
      for (const pattern of policy.excludePatterns) {
        for (const key of Object.keys(env)) {
          if (new RegExp(pattern.replace(/\*/g, ".*"), "i").test(key)) {
            delete env[key];
          }
        }
      }
    }

    if (policy.setVars) {
      Object.assign(env, policy.setVars);
    }

    return env;
  }
}
