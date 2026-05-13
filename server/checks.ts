import { spawn } from "node:child_process";

export interface CheckResult {
  passed: boolean;
  log: string;
}

export function runChecks(): Promise<CheckResult> {
  return new Promise((resolve) => {
    const child = spawn("npm", ["run", "check"], {
      cwd: process.cwd(),
      env: process.env,
      shell: false
    });
    const chunks: string[] = [];
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      chunks.push("\nChecks timed out after 120 seconds.");
    }, 120_000);

    child.stdout.on("data", (chunk) => chunks.push(chunk.toString()));
    child.stderr.on("data", (chunk) => chunks.push(chunk.toString()));
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({
        passed: code === 0,
        log: chunks.join("").trim()
      });
    });
  });
}
