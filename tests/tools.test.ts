import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { Config } from "../src/config/config.js";
import { WriteFileTool } from "../src/tools/builtin/writeFile.js";
import { EditTool } from "../src/tools/builtin/editFile.js";

const tempDir = path.join(process.cwd(), ".tmp-tests");

function createConfig() {
  return new Config({ cwd: tempDir });
}

describe("builtin tools", () => {
  it("writes and edits files", async () => {
    fs.mkdirSync(tempDir, { recursive: true });
    const target = path.join(tempDir, "sample.txt");
    const writeTool = new WriteFileTool(createConfig());
    const editTool = new EditTool(createConfig());

    const writeResult = await writeTool.execute({ params: { path: target, content: "hello" }, cwd: tempDir });
    expect(writeResult.success).toBe(true);

    const editResult = await editTool.execute({
      params: { path: target, old_string: "hello", new_string: "hello world" },
      cwd: tempDir,
    });
    expect(editResult.success).toBe(true);
    expect(fs.readFileSync(target, "utf-8")).toBe("hello world");
  });
});
