import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import type { InteractiveClarifyOutput, QuestionItem } from "@interactive-clarify/shared";

interface LateResponseRecord extends InteractiveClarifyOutput {
  requestId: string;
  createdAt: string;
  questions: QuestionItem[];
}

function getLateResponseDir(): string {
  return path.join(os.homedir(), ".interactive-clarify", "late-responses");
}

export function readLateResponse(requestId?: string): LateResponseRecord | null {
  const dir = getLateResponseDir();
  if (!fs.existsSync(dir)) {
    return null;
  }

  if (requestId) {
    const filePath = path.join(dir, `${requestId}.json`);
    if (!fs.existsSync(filePath)) {
      return null;
    }
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as LateResponseRecord;
  }

  const files = fs
    .readdirSync(dir)
    .filter((file) => file.endsWith(".json"))
    .map((file) => ({
      file,
      mtimeMs: fs.statSync(path.join(dir, file)).mtimeMs,
    }))
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  if (files.length === 0) {
    return null;
  }

  return JSON.parse(fs.readFileSync(path.join(dir, files[0].file), "utf8")) as LateResponseRecord;
}
