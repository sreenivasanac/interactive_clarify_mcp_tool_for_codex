import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import type { LateResponseRecord } from "@interactive-clarify/shared";

export function getLateResponseDir(): string {
  return path.join(os.homedir(), ".interactive-clarify", "late-responses");
}

export function ensureLateResponseDir(): string {
  const dir = getLateResponseDir();
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  return dir;
}

export function saveLateResponse(record: LateResponseRecord): string {
  const dir = ensureLateResponseDir();
  const filePath = path.join(dir, `${record.requestId}.json`);
  fs.writeFileSync(filePath, JSON.stringify(record, null, 2), {
    encoding: "utf8",
    mode: 0o600,
  });
  try {
    fs.chmodSync(filePath, 0o600);
  } catch {
    // Best-effort hardening on platforms that support chmod.
  }
  return filePath;
}
