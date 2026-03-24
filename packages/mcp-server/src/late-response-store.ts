import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import type { LateResponseRecord } from "@interactive-clarify/shared";

function getLateResponseDir(): string {
  return path.join(os.homedir(), ".interactive-clarify", "late-responses");
}

function readLateResponseFile(filePath: string): LateResponseRecord | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as LateResponseRecord;
  } catch {
    return null;
  }
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
    return readLateResponseFile(filePath);
  }

  const files = fs
    .readdirSync(dir)
    .filter((file) => file.endsWith(".json"))
    .map((file) => ({
      file,
      mtimeMs: fs.statSync(path.join(dir, file)).mtimeMs,
    }))
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  for (const file of files) {
    const record = readLateResponseFile(path.join(dir, file.file));
    if (record) {
      return record;
    }
  }

  return null;
}
