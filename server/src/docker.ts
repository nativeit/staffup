import Docker from "dockerode";
import fs from "node:fs";

export interface ContainerInfo {
  id: string;
  name: string;
  image: string;
  state: string;
  status: string;
  managed: boolean;
  serviceId: string | null;
}

/** Driver interface so the GUI degrades gracefully without a Docker socket. */
export interface DockerDriver {
  available(): boolean;
  listContainers(): Promise<ContainerInfo[]>;
  action(id: string, action: "start" | "stop" | "restart"): Promise<void>;
  remove(id: string): Promise<void>;
  logs(id: string, tail: number): Promise<string>;
  stats(id: string): Promise<object | null>;
}

class RealDriver implements DockerDriver {
  private docker: Docker;
  constructor(socketPath: string) {
    this.docker = new Docker({ socketPath });
  }
  available(): boolean {
    return true;
  }
  async listContainers(): Promise<ContainerInfo[]> {
    const containers = await this.docker.listContainers({ all: true });
    return containers.map((c) => {
      const name = c.Names?.[0]?.replace(/^\//, "") ?? c.Id.slice(0, 12);
      const labels = c.Labels ?? {};
      return {
        id: c.Id,
        name,
        image: c.Image,
        state: c.State,
        status: c.Status,
        managed: labels["staffup.managed"] === "true" || (c.Labels?.["com.docker.compose.project"] ?? "") === "staffup",
        serviceId: labels["com.docker.compose.service"] ?? null,
      };
    });
  }
  async action(id: string, action: "start" | "stop" | "restart"): Promise<void> {
    const c = this.docker.getContainer(id);
    if (action === "start") await c.start();
    else if (action === "stop") await c.stop();
    else await c.restart();
  }
  async remove(id: string): Promise<void> {
    await this.docker.getContainer(id).remove({ force: true });
  }
  async logs(id: string, tail: number): Promise<string> {
    const stream: any = await this.docker.getContainer(id).logs({
      stdout: true,
      stderr: true,
      tail,
      timestamps: false,
      follow: false,
    });
    if (typeof stream === "string") return stream;
    const { PassThrough } = await import("node:stream");
    const out: any = new PassThrough();
    let text = "";
    out.on("data", (d: Buffer) => (text += d.toString()));
    (this.docker as any).modem.demuxStream(stream, out, out);
    await new Promise<void>((resolve, reject) => {
      stream.on("end", () => resolve());
      stream.on("error", reject);
      out.on("error", reject);
    });
    return text.replace(/\x00/g, "");
  }
  async stats(id: string): Promise<object | null> {
    try {
      const s = (await this.docker.getContainer(id).stats({ stream: false })) as any;
      const cpuDelta = s.cpu_stats.cpu_usage.total_usage - s.precpu_stats.cpu_usage.total_usage;
      const sysDelta = s.cpu_stats.system_cpu_usage - s.precpu_stats.system_cpu_usage;
      const cpuPercent = sysDelta > 0 ? (cpuDelta / sysDelta) * (s.cpu_stats.online_cpus ?? 1) * 100 : 0;
      const memUsage = s.memory_stats.usage ?? 0;
      const memLimit = s.memory_stats.limit ?? 1;
      return {
        cpuPercent: +cpuPercent.toFixed(1),
        memUsedMb: +(memUsage / 1024 / 1024).toFixed(0),
        memLimitMb: +(memLimit / 1024 / 1024).toFixed(0),
        memPercent: +((memUsage / memLimit) * 100).toFixed(1),
      };
    } catch {
      return null;
    }
  }
}

class MockDriver implements DockerDriver {
  private data: ContainerInfo[] = [
    { id: "mock-traefik", name: "staffup-traefik-1", image: "traefik:v3.3", state: "running", status: "Up 2 hours", managed: true, serviceId: "traefik" },
    { id: "mock-postgres", name: "staffup-postgres-1", image: "postgres:17-alpine", state: "running", status: "Up 2 hours (healthy)", managed: true, serviceId: "postgres" },
    { id: "mock-redis", name: "staffup-redis-1", image: "redis:7-alpine", state: "running", status: "Up 2 hours", managed: true, serviceId: "redis" },
    { id: "mock-authentik", name: "staffup-authentik-1", image: "ghcr.io/goauthentik/server:2025.2", state: "running", status: "Up 1 hour", managed: true, serviceId: "authentik" },
    { id: "mock-mattermost", name: "staffup-mattermost-1", image: "mattermost/mattermost-enterprise-edition:10.6", state: "exited", status: "Exited (1) 5 minutes ago", managed: true, serviceId: "mattermost" },
  ];
  available(): boolean {
    return false;
  }
  async listContainers(): Promise<ContainerInfo[]> {
    return this.data;
  }
  async action(id: string, action: "start" | "stop" | "restart"): Promise<void> {
    const c = this.data.find((d) => d.id === id);
    if (c) c.state = action === "stop" ? "exited" : "running";
  }
  async remove(id: string): Promise<void> {
    this.data = this.data.filter((d) => d.id !== id);
  }
  async logs(id: string, tail: number): Promise<string> {
    const c = this.data.find((d) => d.id === id);
    const name = c?.name ?? id;
    const lines = [
      `${name}: starting...`,
      `${name}: connected to network staffup_internal`,
      `${name}: health check passed`,
      `${name}: serving on internal port`,
    ];
    return lines.slice(-tail).join("\n") + "\n";
  }
  async stats(id: string): Promise<object | null> {
    return { cpuPercent: 3.0, memUsedMb: 220, memLimitMb: 2048, memPercent: 10.7 };
  }
}

export function createDriver(): DockerDriver {
  const socket = process.env.DOCKER_SOCKET || "/var/run/docker.sock";
  try {
    if (fs.existsSync(socket)) {
      return new RealDriver(socket);
    }
  } catch {
    // fall through to mock
  }
  console.warn("Docker socket unavailable, using mock driver");
  return new MockDriver();
}

export const driver: DockerDriver = createDriver();

export function dockerAvailable(): boolean {
  try {
    return fs.existsSync(process.env.DOCKER_SOCKET || "/var/run/docker.sock");
  } catch {
    return false;
  }
}