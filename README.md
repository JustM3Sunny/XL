# AI Agent (Node.js)

A Node.js AI agent that can execute tasks using tools, manage multi-turn conversations, and provide an interactive CLI experience.

## Features

### Core Functionality

- Interactive and single-run modes
- Streaming text responses
- Multi-turn conversations with tool calling
- Configurable model settings and temperature
- Built-in planning step (plan then do)

### Built-in Tools

- File operations: read, write, edit files
- File management: copy, move, delete, create directories
- Directory operations: list directories, search with glob patterns
- Text search: grep for pattern matching
- Shell execution: run shell commands
- Web access: search and fetch web content
- Memory: store and retrieve information
- Todo: manage task lists
- String manipulation utilities

### Context Management

- Automatic context compression when approaching token limits
- Tool output pruning to manage context size
- Token usage tracking

### Safety and Approval

- Multiple approval policies: on-request, auto, never, yolo
- Dangerous command detection and blocking
- Path-based safety checks
- User confirmation prompts for mutating operations

### Session Management

- Save and resume sessions
- Create checkpoints
- Persistent session storage

### MCP Integration

- Connect to Model Context Protocol servers
- Use tools from MCP servers
- Support for stdio and HTTP transports

### Subagents

- Specialized subagents for specific tasks
- Built-in subagents: codebase investigator, code reviewer
- Configurable subagent definitions with custom tools and limits

### Loop Detection

- Detects repeating actions
- Prevents infinite loops in agent execution

### Hooks System

- Execute scripts before/after agent runs
- Execute scripts before/after tool calls
- Error handling hooks
- Custom commands and scripts

### Configuration

- Configurable working directory
- Tool allowlisting
- Developer and user instructions
- Shell environment policies
- MCP server configuration

### User Interface

- Terminal UI with formatted output
- Command interface: /help, /config, /tools, /mcp, /stats, /save, /resume, /checkpoint, /restore
- Real-time tool call visualization

## Installation

```bash
npm install
```

## Configuration

- Set provider-specific keys in your environment (Gemini is default):

```bash
export API_KEY=your_llm_key
```

- Or set the Gemini key in `.env`:

```bash
GEMINI_API_KEY=your_gemini_key
- Or set provider-specific keys in `.env`:

```bash
GEMINI_API_KEY=your_gemini_key
GROQ_API_KEY=your_groq_key
```

- The default model is `gemini-2.5-flash-lite`. You can change it via config or `/model`.

- Optional: Set a custom API base URL (e.g., OpenRouter):

```bash
export BASE_URL=https://openrouter.ai/api/v1
```

- Optional: create `~/.config/ai-agent/config.toml` or `.ai-agent/config.toml` in your project directory.

## Usage

### Interactive Mode

```bash
npm run dev
```

### Single Prompt Mode

```bash
npm run dev -- "Summarize the repo"
```

### Provider selection

```
/provider gemini
/provider groq
```

### Build

```bash
npm run build
```

### Run built CLI

```bash
node dist/main.js
```

## Testing

```bash
npm test
```

## Configuration Options (TOML)

```toml
cwd = "."
provider = "gemini"
autoplan = true

[model]
name = "gemini-2.5-flash-lite"
temperature = 1.0
context_window = 256000

[shell_environment]
ignore_default_excludes = false
exclude_patterns = ["*KEY*", "*TOKEN*", "*SECRET*"]
set_vars = { }

hooks_enabled = false

[[hooks]]
name = "example"
trigger = "before_agent"
command = "echo starting"

approval = "on-request"
max_turns = 100

[mcp_servers.example]
enabled = true
command = "mcp-server"
args = []
startup_timeout_sec = 10
```

## License

MIT
