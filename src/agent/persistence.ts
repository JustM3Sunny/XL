import fs from "node:fs";
import path from "node:path";
import { TokenUsage } from "../client/response.js";
import { getDataDir } from "../config/loader.js";

export interface SessionSnapshot {
  sessionId: string;
  createdAt: string;
  updatedAt: string;
  turnCount: number;
  messages: Array<Record<string, any>>;
  totalUsage: TokenUsage;
}

export class PersistenceManager {
  private dataDir: string;
  private sessionsDir: string;
  private checkpointsDir: string;

  constructor() {
    this.dataDir = getDataDir();
    this.sessionsDir = path.join(this.dataDir, "sessions");
    this.checkpointsDir = path.join(this.dataDir, "checkpoints");
    fs.mkdirSync(this.sessionsDir, { recursive: true });
    fs.mkdirSync(this.checkpointsDir, { recursive: true });
  }

  saveSession(snapshot: SessionSnapshot): void {
    const filePath = path.join(this.sessionsDir, `${snapshot.sessionId}.json`);
    fs.writeFileSync(filePath, JSON.stringify(snapshot, null, 2), "utf-8");
  }

  loadSession(sessionId: string): SessionSnapshot | null {
    const filePath = path.join(this.sessionsDir, `${sessionId}.json`);
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    return data as SessionSnapshot;
  }

  listSessions(): Array<{ sessionId: string; createdAt: string; updatedAt: string; turnCount: number }> {
    const sessions: Array<{ sessionId: string; createdAt: string; updatedAt: string; turnCount: number }> = [];
    for (const file of fs.readdirSync(this.sessionsDir)) {
      if (!file.endsWith(".json")) {
        continue;
      }
      const data = JSON.parse(fs.readFileSync(path.join(this.sessionsDir, file), "utf-8"));
      sessions.push({
        sessionId: data.sessionId,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
        turnCount: data.turnCount,
      });
    }
    sessions.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
    return sessions;
  }

  saveCheckpoint(snapshot: SessionSnapshot): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const checkpointId = `${snapshot.sessionId}_${timestamp}`;
    const filePath = path.join(this.checkpointsDir, `${checkpointId}.json`);
    fs.writeFileSync(filePath, JSON.stringify(snapshot, null, 2), "utf-8");
    return checkpointId;
  }

  loadCheckpoint(checkpointId: string): SessionSnapshot | null {
    const filePath = path.join(this.checkpointsDir, `${checkpointId}.json`);
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    return data as SessionSnapshot;
  }
}
