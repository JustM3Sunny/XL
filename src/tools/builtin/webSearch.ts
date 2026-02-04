import { search } from "duck-duck-scrape";
import { Tool, ToolInvocation, ToolKind, ToolResultFactory } from "../base.js";

export class WebSearchTool extends Tool {
  name = "web_search";
  description = "Search the web for information. Returns search results with titles, URLs and snippets";
  kind = ToolKind.NETWORK;

  get schema() {
    return {
      name: this.name,
      description: this.description,
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Search query",
          },
          max_results: {
            type: "integer",
            minimum: 1,
            maximum: 20,
            description: "Maximum results to return (default: 10)",
          },
        },
        required: ["query"],
      },
    };
  }

  async execute(invocation: ToolInvocation) {
    const params = invocation.params as { query: string; max_results?: number };

    try {
      const results = await search(params.query, {
        safeSearch: "OFF",
      });
      const limited = results.results.slice(0, params.max_results ?? 10);
      if (limited.length === 0) {
        return ToolResultFactory.success(`No results found for: ${params.query}`, { metadata: { results: 0 } });
      }

      const output: string[] = [`Search results for: ${params.query}`];
      limited.forEach((result, index) => {
        output.push(`${index + 1}. Title: ${result.title}`);
        output.push(`   URL: ${result.url}`);
        if (result.description) {
          output.push(`   Snippet: ${result.description}`);
        }
        output.push("");
      });

      return ToolResultFactory.success(output.join("\n"), { metadata: { results: limited.length } });
    } catch (error) {
      return ToolResultFactory.error(`Search failed: ${String(error)}`);
    }
  }
}
