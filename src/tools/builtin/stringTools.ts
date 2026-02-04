import { Tool, ToolInvocation, ToolKind, ToolResultFactory } from "../base.js";

export class StringTools extends Tool {
  name = "string_tools";
  description = "Perform common string manipulations: replace, regex_replace, extract, split, join, to_upper, to_lower, trim.";
  kind = ToolKind.READ;

  get schema() {
    return {
      name: this.name,
      description: this.description,
      parameters: {
        type: "object",
        properties: {
          action: {
            type: "string",
            description: "Action: replace, regex_replace, extract, split, join, to_upper, to_lower, trim",
          },
          input: {
            type: "string",
            description: "Input string",
          },
          pattern: {
            type: "string",
            description: "Pattern or substring",
          },
          replacement: {
            type: "string",
            description: "Replacement string",
          },
          flags: {
            type: "string",
            description: "Regex flags, e.g. gi",
          },
          delimiter: {
            type: "string",
            description: "Delimiter for split/join",
          },
          items: {
            type: "array",
            items: { type: "string" },
            description: "Items for join",
          },
          index: {
            type: "integer",
            description: "Index for extract",
          },
        },
        required: ["action"],
      },
    };
  }

  async execute(invocation: ToolInvocation) {
    const params = invocation.params as {
      action: string;
      input?: string;
      pattern?: string;
      replacement?: string;
      flags?: string;
      delimiter?: string;
      items?: string[];
      index?: number;
    };

    const action = params.action.toLowerCase();
    const input = params.input ?? "";

    if (action === "replace") {
      if (!params.pattern) {
        return ToolResultFactory.error("`pattern` is required for replace");
      }
      return ToolResultFactory.success(input.replace(params.pattern, params.replacement ?? ""));
    }

    if (action === "regex_replace") {
      if (!params.pattern) {
        return ToolResultFactory.error("`pattern` is required for regex_replace");
      }
      const regex = new RegExp(params.pattern, params.flags ?? "");
      return ToolResultFactory.success(input.replace(regex, params.replacement ?? ""));
    }

    if (action === "extract") {
      if (!params.pattern) {
        return ToolResultFactory.error("`pattern` is required for extract");
      }
      const regex = new RegExp(params.pattern, params.flags ?? "");
      const match = input.match(regex);
      if (!match) {
        return ToolResultFactory.success("No match");
      }
      const index = params.index ?? 0;
      return ToolResultFactory.success(match[index] ?? "");
    }

    if (action === "split") {
      const delimiter = params.delimiter ?? ",";
      return ToolResultFactory.success(JSON.stringify(input.split(delimiter)));
    }

    if (action === "join") {
      const delimiter = params.delimiter ?? ",";
      const items = params.items ?? [];
      return ToolResultFactory.success(items.join(delimiter));
    }

    if (action === "to_upper") {
      return ToolResultFactory.success(input.toUpperCase());
    }

    if (action === "to_lower") {
      return ToolResultFactory.success(input.toLowerCase());
    }

    if (action === "trim") {
      return ToolResultFactory.success(input.trim());
    }

    return ToolResultFactory.error(`Unknown action: ${params.action}`);
  }
}
