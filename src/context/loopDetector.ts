export class LoopDetector {
  private maxExactRepeats = 3;
  private maxCycleLength = 3;
  private history: string[] = [];
  private historyMax = 20;

  recordAction(actionType: string, details: Record<string, any> = {}): void {
    const output: string[] = [actionType];

    if (actionType === "tool_call") {
      output.push(details.toolName ?? "");
      const args = details.args ?? {};
      if (typeof args === "object" && args) {
        for (const key of Object.keys(args).sort()) {
          output.push(`${key}=${String(args[key])}`);
        }
      }
    } else if (actionType === "response") {
      output.push(details.text ?? "");
    }

    const signature = output.join("|");
    this.history.push(signature);
    if (this.history.length > this.historyMax) {
      this.history.shift();
    }
  }

  checkForLoop(): string | null {
    if (this.history.length < 2) {
      return null;
    }

    if (this.history.length >= this.maxExactRepeats) {
      const recent = this.history.slice(-this.maxExactRepeats);
      if (new Set(recent).size === 1) {
        return `Same action repeated ${this.maxExactRepeats} times`;
      }
    }

    if (this.history.length >= this.maxCycleLength * 2) {
      const history = this.history;
      const maxCycle = Math.min(this.maxCycleLength, Math.floor(history.length / 2));
      for (let cycleLen = 2; cycleLen <= maxCycle; cycleLen += 1) {
        const recent = history.slice(-cycleLen * 2);
        if (recent.slice(0, cycleLen).join() === recent.slice(cycleLen).join()) {
          return `Detected repeating cycle of length ${cycleLen}`;
        }
      }
    }

    return null;
  }

  clear(): void {
    this.history = [];
  }
}
