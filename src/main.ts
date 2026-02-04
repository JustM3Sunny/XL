import { Command } from "commander";
import readline from "node:readline";
import dotenv from "dotenv";
import { Agent } from "./agent/agent.js";
import { AgentEventType } from "./agent/events.js";
import { PersistenceManager, SessionSnapshot } from "./agent/persistence.js";
import { Config, ApprovalPolicy, ProviderName } from "./config/config.js";
import { loadConfig } from "./config/loader.js";
import { TUI } from "./ui/tui.js";
import { Session } from "./agent/session.js";

class CLI {
  private agent?: Agent;
  private config: Config;
  private tui: TUI;

  constructor(config: Config) {
    this.config = config;
    this.tui = new TUI(config);
  }

  async runSingle(message: string): Promise<string | null> {
    const agent = new Agent(this.config, (confirmation) => this.tui.handleConfirmation(confirmation));
    await agent.initialize();
    this.agent = agent;
    const response = await this.processMessage(message);
    await agent.close();
    return response;
  }

  async runInteractive(): Promise<string | null> {
    this.tui.printWelcome("AI Agent", [
      `model: ${this.config.modelName}`,
      `cwd: ${this.config.cwd}`,
      "commands: /help /config /approval /provider /model /exit",
    ]);

    const agent = new Agent(this.config, (confirmation) => this.tui.handleConfirmation(confirmation));
    await agent.initialize();
    this.agent = agent;

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const promptUser = async (): Promise<void> => {
      try {
        const userInput = await new Promise<string>((resolve) => rl.question("\n[user]> ", resolve));
        const trimmed = userInput.trim();
        if (!trimmed) {
          return promptUser();
        }

        if (trimmed.startsWith("/")) {
          const shouldContinue = await this.handleCommand(trimmed);
          if (!shouldContinue) {
            rl.close();
            await agent.close();
            console.log("\nGoodbye!");
            return;
          }
        } else {
          await this.processMessage(trimmed);
        }

        return promptUser();
      } catch (error) {
        rl.close();
      }
    };

    await promptUser();
    return null;
  }

  private getToolKind(toolName: string): string | null {
    if (!this.agent) {
      return null;
    }
    const tool = this.agent.session.toolRegistry.get(toolName);
    return tool?.kind ?? null;
  }

  private async processMessage(message: string): Promise<string | null> {
    if (!this.agent) {
      return null;
    }

    let assistantStreaming = false;
    let finalResponse: string | null = null;

    for await (const event of this.agent.run(message)) {
      if (event.type === AgentEventType.TEXT_DELTA) {
        const content = event.data.content as string;
        if (!assistantStreaming) {
          this.tui.beginAssistant();
          assistantStreaming = true;
        }
        this.tui.streamAssistantDelta(content);
      } else if (event.type === AgentEventType.TEXT_COMPLETE) {
        finalResponse = event.data.content as string;
        if (assistantStreaming) {
          this.tui.endAssistant();
          assistantStreaming = false;
        }
      } else if (event.type === AgentEventType.AGENT_ERROR) {
        console.error(`\nError: ${event.data.error}`);
      } else if (event.type === AgentEventType.TOOL_CALL_START) {
        const toolName = event.data.name as string;
        const toolKind = this.getToolKind(toolName);
        this.tui.toolCallStart(
          event.data.call_id as string,
          toolName,
          toolKind,
          event.data.arguments as Record<string, any>,
        );
      } else if (event.type === AgentEventType.TOOL_CALL_COMPLETE) {
        const toolName = event.data.name as string;
        const toolKind = this.getToolKind(toolName);
        this.tui.toolCallComplete(
          event.data.call_id as string,
          toolName,
          toolKind,
          Boolean(event.data.success),
          (event.data.output as string) ?? "",
          (event.data.error as string) ?? null,
          (event.data.metadata as Record<string, any>) ?? null,
          (event.data.diff as string) ?? null,
          Boolean(event.data.truncated),
          (event.data.exit_code as number) ?? null,
        );
      }
    }

    return finalResponse;
  }

  private async handleCommand(command: string): Promise<boolean> {
    if (!this.agent) {
      return true;
    }

    const [cmdName, ...rest] = command.trim().split(" ");
    const args = rest.join(" ");

    switch (cmdName.toLowerCase()) {
      case "/exit":
      case "/quit":
        return false;
      case "/help":
        this.tui.showHelp();
        break;
      case "/clear":
        this.agent.session.contextManager.clear();
        this.agent.session.loopDetector.clear();
        console.log("Conversation cleared");
        break;
      case "/config":
        console.log("Current Configuration");
        console.log(`  Provider: ${this.config.provider}`);
        console.log(`  Model: ${this.config.modelName}`);
        console.log(`  Temperature: ${this.config.temperature}`);
        console.log(`  Approval: ${this.config.approval}`);
        console.log(`  Working Dir: ${this.config.cwd}`);
        console.log(`  Max Turns: ${this.config.maxTurns}`);
        console.log(`  Hooks Enabled: ${this.config.hooksEnabled}`);
        console.log(`  Autoplan: ${this.config.autoplan}`);
        break;
      case "/model":
        if (args) {
          this.config.modelName = args;
          console.log(`Model changed to: ${args}`);
        } else {
          console.log(`Current model: ${this.config.modelName}`);
        }
        break;
      case "/approval":
        if (args) {
          if (Object.values(ApprovalPolicy).includes(args as ApprovalPolicy)) {
            this.config.approval = args as ApprovalPolicy;
            console.log(`Approval policy changed to: ${args}`);
          } else {
            console.log(`Incorrect approval policy: ${args}`);
          }
        } else {
          console.log(`Current approval policy: ${this.config.approval}`);
        }
        break;
      case "/provider":
        if (args) {
          if (["gemini"].includes(args)) {
          if (["gemini", "groq"].includes(args)) {
            this.config.provider = args as ProviderName;
            console.log(`Provider changed to: ${args}`);
          } else {
            console.log(`Incorrect provider: ${args}`);
          }
        } else {
          console.log(`Current provider: ${this.config.provider}`);
        }
        break;
      case "/stats": {
        const stats = this.agent.session.getStats();
        console.log("Session Statistics");
        for (const [key, value] of Object.entries(stats)) {
          console.log(`  ${key}: ${JSON.stringify(value)}`);
        }
        break;
      }
      case "/tools": {
        const tools = this.agent.session.toolRegistry.getTools();
        console.log(`Available tools (${tools.length})`);
        for (const tool of tools) {
          console.log(`  • ${tool.name}`);
        }
        break;
      }
      case "/mcp": {
        const servers = this.agent.session.mcpManager.getAllServers();
        console.log(`MCP Servers (${servers.length})`);
        for (const server of servers) {
          console.log(`  • ${server.name}: ${server.status} (${server.tools} tools)`);
        }
        break;
      }
      case "/save": {
        const persistence = new PersistenceManager();
        const snapshot: SessionSnapshot = {
          sessionId: this.agent.session.sessionId,
          createdAt: this.agent.session.createdAt.toISOString(),
          updatedAt: this.agent.session.updatedAt.toISOString(),
          turnCount: this.agent.session.turnCount,
          messages: this.agent.session.contextManager.getMessages(),
          totalUsage: this.agent.session.contextManager.totalUsage,
        };
        persistence.saveSession(snapshot);
        console.log(`Session saved: ${snapshot.sessionId}`);
        break;
      }
      case "/sessions": {
        const persistence = new PersistenceManager();
        const sessions = persistence.listSessions();
        console.log("Saved Sessions");
        for (const session of sessions) {
          console.log(`  • ${session.sessionId} (turns: ${session.turnCount}, updated: ${session.updatedAt})`);
        }
        break;
      }
      case "/resume": {
        if (!args) {
          console.log("Usage: /resume <session_id>");
          break;
        }
        const persistence = new PersistenceManager();
        const snapshot = persistence.loadSession(args);
        if (!snapshot) {
          console.log("Session does not exist");
          break;
        }

        const session = new Session(this.config);
        await session.initialize();
        session.sessionId = snapshot.sessionId;
        session.createdAt = new Date(snapshot.createdAt);
        session.updatedAt = new Date(snapshot.updatedAt);
        session.turnCount = snapshot.turnCount;
        session.contextManager.totalUsage = snapshot.totalUsage;

        for (const msg of snapshot.messages) {
          if (msg.role === "system") {
            continue;
          }
          if (msg.role === "user") {
            session.contextManager.addUserMessage(msg.content);
          } else if (msg.role === "assistant") {
            session.contextManager.addAssistantMessage(msg.content, msg.tool_calls);
          } else if (msg.role === "tool") {
            session.contextManager.addToolResult(msg.tool_call_id, msg.content);
          }
        }

        await this.agent.session.client.close();
        await this.agent.session.mcpManager.shutdown();
        this.agent.session = session;
        console.log(`Resumed session: ${session.sessionId}`);
        break;
      }
      case "/checkpoint": {
        const persistence = new PersistenceManager();
        const snapshot: SessionSnapshot = {
          sessionId: this.agent.session.sessionId,
          createdAt: this.agent.session.createdAt.toISOString(),
          updatedAt: this.agent.session.updatedAt.toISOString(),
          turnCount: this.agent.session.turnCount,
          messages: this.agent.session.contextManager.getMessages(),
          totalUsage: this.agent.session.contextManager.totalUsage,
        };
        const checkpointId = persistence.saveCheckpoint(snapshot);
        console.log(`Checkpoint created: ${checkpointId}`);
        break;
      }
      case "/restore": {
        if (!args) {
          console.log("Usage: /restore <checkpoint_id>");
          break;
        }
        const persistence = new PersistenceManager();
        const snapshot = persistence.loadCheckpoint(args);
        if (!snapshot) {
          console.log("Checkpoint does not exist");
          break;
        }
        const session = new Session(this.config);
        await session.initialize();
        session.sessionId = snapshot.sessionId;
        session.createdAt = new Date(snapshot.createdAt);
        session.updatedAt = new Date(snapshot.updatedAt);
        session.turnCount = snapshot.turnCount;
        session.contextManager.totalUsage = snapshot.totalUsage;

        for (const msg of snapshot.messages) {
          if (msg.role === "system") {
            continue;
          }
          if (msg.role === "user") {
            session.contextManager.addUserMessage(msg.content);
          } else if (msg.role === "assistant") {
            session.contextManager.addAssistantMessage(msg.content, msg.tool_calls);
          } else if (msg.role === "tool") {
            session.contextManager.addToolResult(msg.tool_call_id, msg.content);
          }
        }

        await this.agent.session.client.close();
        await this.agent.session.mcpManager.shutdown();
        this.agent.session = session;
        console.log(`Resumed session: ${session.sessionId}, checkpoint: ${args}`);
        break;
      }
      default:
        console.log(`Unknown command: ${cmdName}`);
    }

    return true;
  }
}

async function main() {
  dotenv.config();
  const program = new Command();
  program.argument("[prompt]", "Prompt to send to the agent");
  program.option("-c, --cwd <path>", "Current working directory");
  program.parse(process.argv);

  const prompt = program.args[0];
  const options = program.opts<{ cwd?: string }>();

  let config: Config;
  try {
    config = loadConfig(options.cwd);
  } catch (error) {
    console.error(`Configuration Error: ${String(error)}`);
    process.exit(1);
    return;
  }

  const errors = config.validate();
  if (errors.length > 0) {
    for (const error of errors) {
      console.error(error);
    }
    process.exit(1);
  }

  const cli = new CLI(config);
  if (prompt) {
    const result = await cli.runSingle(prompt);
    if (!result) {
      process.exit(1);
    }
  } else {
    await cli.runInteractive();
  }
}

main();
