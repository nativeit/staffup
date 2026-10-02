export async function api<T = any>(
  path: string,
  opts: RequestInit = {}
): Promise<T> {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    ...opts,
  });
  if (res.status === 401) {
    window.dispatchEvent(new Event("staffup:unauthorized"));
    throw new Error("unauthorized");
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || res.statusText);
  return body;
}

export type ServiceField = {
  key: string;
  label: string;
  type: "string" | "secret" | "email" | "number" | "boolean" | "select";
  required: boolean;
  options?: string[];
  placeholder?: string;
};

export type Service = {
  id: string;
  name: string;
  description: string;
  category: string;
  tier: "core" | "optional";
  configOnly: boolean;
  subdomain: string | null;
  image: string | null;
  fields: ServiceField[];
  enabled: boolean;
  config: Record<string, string>;
  hasConfig: boolean;
};

export type ContainerInfo = {
  id: string;
  name: string;
  image: string;
  state: string;
  status: string;
  managed: boolean;
  serviceId: string | null;
};

export type DeployState = {
  status: "idle" | "running" | "success" | "error";
  action: string;
  log: string;
  startedAt: string | null;
};