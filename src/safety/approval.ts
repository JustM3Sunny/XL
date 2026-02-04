import path from "node:path";
import { ApprovalPolicy } from "../config/config.js";
import { ToolConfirmation } from "../tools/base.js";

export enum ApprovalDecision {
  APPROVED = "approved",
  REJECTED = "rejected",
  NEEDS_CONFIRMATION = "needs_confirmation",
}

export interface ApprovalContext {
  toolName: string;
  params: Record<string, any>;
  isMutating: boolean;
  affectedPaths: string[];
  command?: string;
  isDangerous?: boolean;
}

const DANGEROUS_PATTERNS = [
  /rm\s+(-rf?|--recursive)\s+[/~]/i,
  /rm\s+-rf?\s+\*/i,
  /rmdir\s+[/~]/i,
  /dd\s+if=/i,
  /mkfs/i,
  /fdisk/i,
  /parted/i,
  /shutdown/i,
  /reboot/i,
  /halt/i,
  /poweroff/i,
  /init\s+[06]/i,
  /chmod\s+(-R\s+)?777\s+[/~]/i,
  /chown\s+-R\s+.*\s+[/~]/i,
  /nc\s+-l/i,
  /netcat\s+-l/i,
  /curl\s+.*\|\s*(bash|sh)/i,
  /wget\s+.*\|\s*(bash|sh)/i,
  /:\(\)\s*\{\s*:\|:&\s*\}\s*;/i,
];

const SAFE_PATTERNS = [
  /^(ls|dir|pwd|cd|echo|cat|head|tail|less|more|wc)(\s|$)/i,
  /^(find|locate|which|whereis|file|stat)(\s|$)/i,
  /^git\s+(status|log|diff|show|branch|remote|tag)(\s|$)/i,
  /^(npm|yarn|pnpm)\s+(list|ls|outdated)(\s|$)/i,
  /^pip\s+(list|show|freeze)(\s|$)/i,
  /^cargo\s+(tree|search)(\s|$)/i,
  /^(grep|awk|sed|cut|sort|uniq|tr|diff|comm)(\s|$)/i,
  /^(date|cal|uptime|whoami|id|groups|hostname|uname)(\s|$)/i,
  /^(env|printenv|set)$/i,
  /^(ps|top|htop|pgrep)(\s|$)/i,
];

export function isDangerousCommand(command: string): boolean {
  return DANGEROUS_PATTERNS.some((pattern) => pattern.test(command));
}

export function isSafeCommand(command: string): boolean {
  return SAFE_PATTERNS.some((pattern) => pattern.test(command));
}

export class ApprovalManager {
  approvalPolicy: ApprovalPolicy;
  cwd: string;
  confirmationCallback?: (confirmation: ToolConfirmation) => boolean;

  constructor(approvalPolicy: ApprovalPolicy, cwd: string, confirmationCallback?: (confirmation: ToolConfirmation) => boolean) {
    this.approvalPolicy = approvalPolicy;
    this.cwd = cwd;
    this.confirmationCallback = confirmationCallback;
  }

  private assessCommandSafety(command: string): ApprovalDecision {
    if (this.approvalPolicy === ApprovalPolicy.YOLO) {
      return ApprovalDecision.APPROVED;
    }

    if (isDangerousCommand(command)) {
      return ApprovalDecision.REJECTED;
    }

    if (this.approvalPolicy === ApprovalPolicy.NEVER) {
      return isSafeCommand(command) ? ApprovalDecision.APPROVED : ApprovalDecision.REJECTED;
    }

    if ([ApprovalPolicy.AUTO, ApprovalPolicy.ON_FAILURE].includes(this.approvalPolicy)) {
      return ApprovalDecision.APPROVED;
    }

    if (this.approvalPolicy === ApprovalPolicy.AUTO_EDIT) {
      return isSafeCommand(command) ? ApprovalDecision.APPROVED : ApprovalDecision.NEEDS_CONFIRMATION;
    }

    return isSafeCommand(command) ? ApprovalDecision.APPROVED : ApprovalDecision.NEEDS_CONFIRMATION;
  }

  async checkApproval(context: ApprovalContext): Promise<ApprovalDecision> {
    if (!context.isMutating) {
      return ApprovalDecision.APPROVED;
    }

    if (context.command) {
      const decision = this.assessCommandSafety(context.command);
      if (decision !== ApprovalDecision.NEEDS_CONFIRMATION) {
        return decision;
      }
    }

    for (const target of context.affectedPaths) {
      const resolved = path.resolve(target);
      if (!resolved.startsWith(path.resolve(this.cwd))) {
        return ApprovalDecision.NEEDS_CONFIRMATION;
      }
    }

    if (context.isDangerous) {
      return this.approvalPolicy === ApprovalPolicy.YOLO ? ApprovalDecision.APPROVED : ApprovalDecision.NEEDS_CONFIRMATION;
    }

    return ApprovalDecision.APPROVED;
  }

  requestConfirmation(confirmation: ToolConfirmation): boolean {
    if (this.confirmationCallback) {
      return this.confirmationCallback(confirmation);
    }

    return true;
  }
}
