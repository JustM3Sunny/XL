import { Tool, ToolInvocation, ToolKind, ToolResultFactory } from "../base.js";

export class WebFetchTool extends Tool {
  name = "web_fetch";
  description = "Fetch content from a URL. Returns the response body as text";
  kind = ToolKind.NETWORK;

  get schema() {
    return {
      name: this.name,
      description: this.description,
      parameters: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: "URL to fetch (must be http:// or https://)",
          },
          timeout: {
            type: "integer",
            minimum: 5,
            maximum: 120,
            description: "Request timeout in seconds (default: 120)",
          },
        },
        required: ["url"],
      },
    };
  }

  async execute(invocation: ToolInvocation) {
    const params = invocation.params as { url: string; timeout?: number };
    const url = params.url;

    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      return ToolResultFactory.error("Url must be http:// or https://");
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), (params.timeout ?? 120) * 1000);
      const response = await fetch(url, { signal: controller.signal, redirect: "follow" });
      clearTimeout(timeout);

      if (!response.ok) {
        return ToolResultFactory.error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const text = await response.text();
      let content = text;
      if (content.length > 100 * 1024) {
        content = `${content.slice(0, 100 * 1024)}\n... [content truncated]`;
      }

      return ToolResultFactory.success(content, {
        metadata: {
          status_code: response.status,
          content_length: text.length,
        },
      });
    } catch (error) {
      return ToolResultFactory.error(`Request failed: ${String(error)}`);
    }
  }
}
