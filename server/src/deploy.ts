import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { PROJECT_NAME, composeYaml, generateEnv, validateConfig } from "./compose.js";
import { db } from "./db.js";

export interface DeploymentState {
  status: "idle" | "running" | "success" | "error";
  action: string;
  log: string;
  startedAt: string | null;
}

let current: DeploymentState = {
  status: "idle",
  action: "",
  log: "",
  startedAt: null,
};

type Listener = (state: DeploymentState) => void;
const listeners = new Set<Listener>();

export function onDeployEvent(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function update(patch: Partial<DeploymentState>) {
  current = { ...current, ...patch };
  for (const fn of listeners) fn(current);
}

export function getDeployState(): DeploymentState {
  return current;
}

const stackDir =
  process.env.STAFFUP_STACK_DIR || path.join(process.cwd(), "data", "stack");

function writeStackFiles() {
  fs.mkdirSync(stackDir, { recursive: true });
  const composeFile = path.join(stackDir, "docker-compose.yml");
  const envFile = path.join(stackDir, ".env");
  fs.writeFileSync(composeFile, composeYaml(), { mode: 0o600 });
  fs.writeFileSync(envFile, generateEnv(), { mode: 0o600 });
  // placeholder hermes profile mount dir so compose doesn't create a file
  const hermesDir = path.join(stackDir, "hermes");
  fs.mkdirSync(hermesDir, { recursive: true });
}

function runCompose(args: string[], onLine: (line: string) => void): Promise<number> {
  return new Promise((resolve) => {
    const proc = spawn("docker", ["compose", "-p", PROJECT_NAME, ...args], {
      cwd: stackDir,
      env: { ...process.env, DOCKER_CONFIG: "" },
    });
    const feed = (buf: Buffer) => {
      for (const line of buf.toString().split("\n")) {
        if (line.trim()) onLine(line);
      }
    };
    proc.stdout.on("data", feed);
    proc.stderr.on("data", feed);
    proc.on("error", (err) => onLine(`[error] ${err.message}`));
    proc.on("close", (code) => resolve(code ?? 1));
  });
}

export async function deploy(action: "up" | "down" | "pull"): Promise<DeploymentState> {
  const validation = validateConfig();
  if (action !== "down" && !validation.ok) {
    update({
      status: "error",
      action,
      log: `Configuration incomplete:\n${validation.missing.map((m) => `- ${m}`).join("\n")}`,
    });
    return current;
  }
  if (current.status === "running") {
    return current;
  }
  update({ status: "running", action, log: "", startedAt: new Date().toISOString() });

  if (action !== "down") writeStackFiles();

  const args =
    action === "up"
      ? ["up", "-d", "--remove-orphans"]
      : action === "down"
        ? ["down", "--remove-orphans"]
        : ["pull"];

  const code = await runCompose(args, (line) => {
    update({ log: current.log + line + "\n" });
  });

  db.prepare(
    "INSERT INTO deployments (action, status, finished_at, log) VALUES (?,?,datetime('now'),?)"
  ).run(action, code === 0 ? "success" : "error", current.log);

  update({ status: code === 0 ? "success" : "error" });
  return current;
}

export function recentDeployments(limit = 20) {
  return db
    .prepare("SELECT * FROM deployments ORDER BY id DESC LIMIT ?")
    .all(limit) as Array<{
    id: number;
    started_at: string;
    finished_at: string | null;
    status: string;
    action: string;
    log: string;
  }>;
}