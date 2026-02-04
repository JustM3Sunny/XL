import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { Config } from "../src/config/config.js";
import { WriteFileTool } from "../src/tools/builtin/writeFile.js";
import { EditTool } from "../src/tools/builtin/editFile.js";
import { MakeDirTool } from "../src/tools/builtin/makeDir.js";
import { CopyFileTool } from "../src/tools/builtin/copyFile.js";
import { MoveFileTool } from "../src/tools/builtin/moveFile.js";
import { DeleteFileTool } from "../src/tools/builtin/deleteFile.js";

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

  it("creates directories and copies/moves/deletes files", async () => {
    fs.mkdirSync(tempDir, { recursive: true });
    const nestedDir = path.join(tempDir, "nested");
    const filePath = path.join(nestedDir, "copy.txt");
    const copyPath = path.join(tempDir, "copy.txt");
    const movedPath = path.join(tempDir, "moved.txt");

    const makeDirTool = new MakeDirTool(createConfig());
    const writeTool = new WriteFileTool(createConfig());
    const copyTool = new CopyFileTool(createConfig());
    const moveTool = new MoveFileTool(createConfig());
    const deleteTool = new DeleteFileTool(createConfig());

    const dirResult = await makeDirTool.execute({ params: { path: nestedDir }, cwd: tempDir });
    expect(dirResult.success).toBe(true);

    const writeResult = await writeTool.execute({ params: { path: filePath, content: "copy me", create_directories: true }, cwd: tempDir });
    expect(writeResult.success).toBe(true);

    const copyResult = await copyTool.execute({ params: { source: filePath, destination: copyPath, overwrite: true }, cwd: tempDir });
    expect(copyResult.success).toBe(true);
    expect(fs.readFileSync(copyPath, "utf-8")).toBe("copy me");

    const moveResult = await moveTool.execute({ params: { source: copyPath, destination: movedPath, overwrite: true }, cwd: tempDir });
    expect(moveResult.success).toBe(true);
    expect(fs.existsSync(copyPath)).toBe(false);
    expect(fs.readFileSync(movedPath, "utf-8")).toBe("copy me");

    const deleteResult = await deleteTool.execute({ params: { path: movedPath }, cwd: tempDir });
    expect(deleteResult.success).toBe(true);
    expect(fs.existsSync(movedPath)).toBe(false);
  });
});
