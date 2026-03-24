import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import type { InteractiveClarifyOutput, QuestionItem } from "@interactive-clarify/shared";

export interface LateResponseRecord extends InteractiveClarifyOutput {
  requestId: string;
  createdAt: string;
  questions: QuestionItem[];
}

function getLateResponseDir(): string {
  return path.join(os.homedir(), ".interactive-clarify", "late-responses");
}

export function saveLateResponse(record: LateResponseRecord): string {
  const dir = getLateResponseDir();
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });

  const filePath = path.join(dir, `${record.requestId}.json`);
  fs.writeFileSync(filePath, JSON.stringify(record, null, 2), "utf8");
  return filePath;
}
