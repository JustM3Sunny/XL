import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { Config, HookConfig, HookTrigger } from "../config/config.js";
import { ToolResult } from "../tools/base.js";

export class HookSystem {
  private config: Config;
  private hooks: HookConfig[];

  constructor(config: Config) {
    this.config = config;
    this.hooks = config.hooksEnabled ? config.hooks.filter((hook) => hook.enabled) : [];
  }

  private runCommand(command: string, timeoutSec: number, env: Record<string, string>): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn(command, {
        shell: true,
        cwd: this.config.cwd,
        env,
        detached: process.platform !== "win32",
        stdio: "ignore",
      });

      const timeout = setTimeout(() => {
        if (process.platform !== "win32") {
          process.kill(-child.pid, "SIGKILL");
        } else {
          child.kill("SIGKILL");
        }
        resolve();
      }, timeoutSec * 1000);

      child.on("exit", () => {
        clearTimeout(timeout);
        resolve();
      });
      child.on("error", (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  private async runHook(hook: HookConfig, env: Record<string, string>): Promise<void> {
    try {
      if (hook.command) {
        await this.runCommand(hook.command, hook.timeoutSec, env);
        return;
      }

      const script = hook.script ?? "";
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-agent-hook-"));
      const scriptPath = path.join(tmpDir, "hook.sh");
      fs.writeFileSync(scriptPath, `#!/bin/bash\n${script}`, "utf-8");
      fs.chmodSync(scriptPath, 0o755);
      await this.runCommand(scriptPath, hook.timeoutSec, env);
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (error) {
      console.error(error);
    }
  }

  private buildEnv(trigger: HookTrigger, toolName?: string, userMessage?: string, error?: Error): Record<string, string> {
    const env: Record<string, string> = { ...process.env } as Record<string, string>;
    env.AI_AGENT_TRIGGER = trigger;
    env.AI_AGENT_CWD = this.config.cwd;

    if (toolName) {
      env.AI_AGENT_TOOL_NAME = toolName;
    }

    if (userMessage) {
      env.AI_AGENT_USER_MESSAGE = userMessage;
    }

    if (error) {
      env.AI_AGENT_ERROR = error.message;
    }

    return env;
  }

  async triggerBeforeAgent(userMessage: string): Promise<void> {
    const env = this.buildEnv(HookTrigger.BEFORE_AGENT, undefined, userMessage);
    for (const hook of this.hooks) {
      if (hook.trigger === HookTrigger.BEFORE_AGENT) {
        await this.runHook(hook, env);
      }
    }
  }

  async triggerAfterAgent(userMessage: string, agentResponse?: string | null): Promise<void> {
    const env = this.buildEnv(HookTrigger.AFTER_AGENT, undefined, userMessage);
    if (agentResponse) {
      env.AI_AGENT_RESPONSE = agentResponse;
    }
    for (const hook of this.hooks) {
      if (hook.trigger === HookTrigger.AFTER_AGENT) {
        await this.runHook(hook, env);
      }
    }
  }

  async triggerBeforeTool(toolName: string, toolParams: Record<string, any>): Promise<void> {
    const env = this.buildEnv(HookTrigger.BEFORE_TOOL, toolName);
    env.AI_AGENT_TOOL_PARAMS = JSON.stringify(toolParams);
    for (const hook of this.hooks) {
      if (hook.trigger === HookTrigger.BEFORE_TOOL) {
        await this.runHook(hook, env);
      }
    }
  }

  async triggerAfterTool(toolName: string, toolParams: Record<string, any>, toolResult: ToolResult): Promise<void> {
    const env = this.buildEnv(HookTrigger.AFTER_TOOL, toolName);
    env.AI_AGENT_TOOL_PARAMS = JSON.stringify(toolParams);
    env.AI_AGENT_TOOL_RESULT = toolResult.success ? toolResult.output : `Error: ${toolResult.error}\n\nOutput:\n${toolResult.output}`;
    for (const hook of this.hooks) {
      if (hook.trigger === HookTrigger.AFTER_TOOL) {
        await this.runHook(hook, env);
      }
    }
  }

  async triggerOnError(error: Error): Promise<void> {
    const env = this.buildEnv(HookTrigger.ON_ERROR, undefined, undefined, error);
    for (const hook of this.hooks) {
      if (hook.trigger === HookTrigger.ON_ERROR) {
        await this.runHook(hook, env);
      }
    }
  }
}
