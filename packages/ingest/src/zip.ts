import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";

export function listZipEntries(zipPath: string): string[] {
  const out = execFileSync("unzip", ["-Z1", zipPath], {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  return out.trim().split("\n").filter(Boolean);
}

/**
 * Stream a single entry out of a zip to a file without extracting the
 * archive — keeps peak disk usage to one year's CSV on a nearly-full disk.
 */
export async function extractEntryTo(
  zipPath: string,
  entry: string,
  destFile: string,
): Promise<void> {
  await fs.promises.mkdir(path.dirname(destFile), { recursive: true });
  const child = spawn("unzip", ["-p", zipPath, entry], {
    stdio: ["ignore", "pipe", "inherit"],
  });
  const exited = new Promise<void>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`unzip exited with code ${code} for entry ${entry}`)),
    );
  });
  await pipeline(child.stdout, fs.createWriteStream(destFile));
  await exited;
}
