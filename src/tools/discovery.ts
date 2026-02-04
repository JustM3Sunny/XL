import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { Config } from "../config/config.js";
import { getConfigDir } from "../config/loader.js";
import { Tool } from "./base.js";
import { ToolRegistry } from "./registry.js";

export class ToolDiscoveryManager {
  private config: Config;
  private registry: ToolRegistry;

  constructor(config: Config, registry: ToolRegistry) {
    this.config = config;
    this.registry = registry;
  }

  private async loadToolModule(filePath: string): Promise<any> {
    const moduleUrl = pathToFileURL(filePath).href;
    return import(moduleUrl);
  }

  private findToolClasses(module: any): Array<new (config: Config) => Tool> {
    const tools: Array<new (config: Config) => Tool> = [];
    for (const value of Object.values(module)) {
      if (typeof value === "function" && value.prototype instanceof Tool) {
        tools.push(value as new (config: Config) => Tool);
      }
    }
    return tools;
  }

  async discoverFromDirectory(directory: string): Promise<void> {
    const toolDir = path.join(directory, ".ai-agent", "tools");
    if (!fs.existsSync(toolDir)) {
      return;
    }

    const files = fs.readdirSync(toolDir);
    for (const file of files) {
      if (!file.endsWith(".js") && !file.endsWith(".ts")) {
        continue;
      }
      if (file.startsWith("__")) {
        continue;
      }
      try {
        const module = await this.loadToolModule(path.join(toolDir, file));
        const toolClasses = this.findToolClasses(module);
        for (const ToolClass of toolClasses) {
          this.registry.register(new ToolClass(this.config));
        }
      } catch (error) {
        continue;
      }
    }
  }

  async discoverAll(): Promise<void> {
    await this.discoverFromDirectory(this.config.cwd);
    await this.discoverFromDirectory(getConfigDir());
  }
}
