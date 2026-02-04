import fs from "node:fs";
import path from "node:path";
import envPaths from "env-paths";
import toml from "@iarna/toml";
import { Config, ConfigOptions, validateMcpConfig } from "./config.js";
import { ConfigError } from "../utils/errors.js";

const CONFIG_FILE_NAME = "config.toml";
const AGENT_MD_FILE = "AGENT.MD";

const paths = envPaths("ai-agent");

export function getConfigDir(): string {
  return paths.config;
}

export function getDataDir(): string {
  return paths.data;
}

export function getSystemConfigPath(): string {
  return path.join(getConfigDir(), CONFIG_FILE_NAME);
}

function parseToml(filePath: string): Record<string, unknown> {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    return toml.parse(content) as Record<string, unknown>;
  } catch (error) {
    throw new ConfigError(`Invalid TOML in ${filePath}: ${String(error)}`, filePath);
  }
}

function getProjectConfig(cwd: string): string | null {
  const agentDir = path.join(cwd, ".ai-agent");
  const configPath = path.join(agentDir, CONFIG_FILE_NAME);
  if (fs.existsSync(configPath)) {
    return configPath;
  }
  return null;
}

function getAgentMdFile(cwd: string): string | null {
  const agentPath = path.join(cwd, AGENT_MD_FILE);
  if (fs.existsSync(agentPath)) {
    return fs.readFileSync(agentPath, "utf-8");
  }
  return null;
}

function mergeConfigs(base: Record<string, unknown>, override: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(override)) {
    const existing = result[key];
    if (typeof existing === "object" && existing && typeof value === "object" && value) {
      result[key] = mergeConfigs(existing as Record<string, unknown>, value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }
  return result;
}

function normalizeConfig(rawConfig: Record<string, unknown>, cwd: string): ConfigOptions {
  const model = (rawConfig.model as Record<string, unknown>) ?? {};
  const shellEnvironment = (rawConfig.shell_environment as Record<string, unknown>) ?? rawConfig.shellEnvironment ?? {};

  const mcpServers: Record<string, any> = (rawConfig.mcp_servers as Record<string, unknown>) ?? rawConfig.mcpServers ?? {};
  for (const [name, config] of Object.entries(mcpServers)) {
    validateMcpConfig(config as any);
    mcpServers[name] = {
      enabled: (config as any).enabled ?? true,
      startupTimeoutSec: (config as any).startup_timeout_sec ?? (config as any).startupTimeoutSec ?? 10,
      command: (config as any).command ?? undefined,
      args: (config as any).args ?? [],
      env: (config as any).env ?? {},
      cwd: (config as any).cwd ? path.resolve(String((config as any).cwd)) : undefined,
      url: (config as any).url ?? undefined,
    };
  }

  return {
    model: {
      name: (model.name as string) ?? undefined,
      temperature: (model.temperature as number) ?? undefined,
      contextWindow: (model.context_window as number) ?? (model.contextWindow as number) ?? undefined,
    },
    cwd,
    shellEnvironment: {
      ignoreDefaultExcludes: Boolean((shellEnvironment as any).ignore_default_excludes ?? (shellEnvironment as any).ignoreDefaultExcludes ?? false),
      excludePatterns: (shellEnvironment as any).exclude_patterns ?? (shellEnvironment as any).excludePatterns ?? undefined,
      setVars: (shellEnvironment as any).set_vars ?? (shellEnvironment as any).setVars ?? undefined,
    },
    hooksEnabled: Boolean((rawConfig.hooks_enabled ?? rawConfig.hooksEnabled) ?? false),
    hooks: (rawConfig.hooks as any[]) ?? [],
    approval: (rawConfig.approval as any) ?? undefined,
    maxTurns: (rawConfig.max_turns as number) ?? (rawConfig.maxTurns as number) ?? undefined,
    mcpServers,
    allowedTools: (rawConfig.allowed_tools as string[]) ?? (rawConfig.allowedTools as string[]) ?? undefined,
    developerInstructions: (rawConfig.developer_instructions as string) ?? (rawConfig.developerInstructions as string) ?? undefined,
    userInstructions: (rawConfig.user_instructions as string) ?? (rawConfig.userInstructions as string) ?? undefined,
    debug: Boolean(rawConfig.debug ?? false),
  };
}

export function loadConfig(cwd?: string): Config {
  const resolvedCwd = cwd ? path.resolve(cwd) : process.cwd();
  let configData: Record<string, unknown> = {};

  const systemPath = getSystemConfigPath();
  if (fs.existsSync(systemPath)) {
    try {
      configData = parseToml(systemPath);
    } catch (error) {
      console.warn(`Skipping invalid system config: ${systemPath}`);
    }
  }

  const projectPath = getProjectConfig(resolvedCwd);
  if (projectPath) {
    try {
      const projectConfig = parseToml(projectPath);
      configData = mergeConfigs(configData, projectConfig);
    } catch (error) {
      console.warn(`Skipping invalid project config: ${projectPath}`);
    }
  }

  if (!configData.cwd) {
    configData.cwd = resolvedCwd;
  }

  if (!configData.developer_instructions) {
    const agentContent = getAgentMdFile(resolvedCwd);
    if (agentContent) {
      configData.developer_instructions = agentContent;
    }
  }

  const normalized = normalizeConfig(configData, resolvedCwd);
  return new Config(normalized);
}
