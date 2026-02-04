export class ConfigError extends Error {
  configFile?: string;

  constructor(message: string, configFile?: string) {
    super(message);
    this.name = "ConfigError";
    this.configFile = configFile;
  }
}
