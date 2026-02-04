import path from "node:path";
import fs from "node:fs";

export function resolvePath(base: string, target: string): string {
  if (path.isAbsolute(target)) {
    return path.resolve(target);
  }
  return path.resolve(base, target);
}

export function displayPathRelToCwd(target: string, cwd?: string | null): string {
  try {
    if (!cwd) {
      return target;
    }
    const relative = path.relative(cwd, target);
    return relative.startsWith("..") ? target : relative;
  } catch (error) {
    return target;
  }
}

export function ensureParentDirectory(target: string): string {
  const parent = path.dirname(target);
  fs.mkdirSync(parent, { recursive: true });
  return target;
}

export function isBinaryFile(target: string): boolean {
  try {
    const buffer = fs.readFileSync(target);
    return buffer.includes(0);
  } catch (error) {
    return false;
  }
}
