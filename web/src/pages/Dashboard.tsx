import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Activity, Boxes, Server } from "lucide-react";
import { api, type ContainerInfo, type Service } from "../lib/api";

export default function Dashboard() {
  const [containers, setContainers] = useState<ContainerInfo[] | null>(null);
  const [services, setServices] = useState<Service[] | null>(null);
  const [docker, setDocker] = useState<boolean>(false);

  useEffect(() => {
    api<{ available: boolean }>("/api/docker/status").then((s) => setDocker(s.available));
    api<Service[]>("/api/services").then(setServices);
    api<ContainerInfo[]>("/api/containers").then(setContainers).catch(() => setContainers([]));
  }, []);

  const running = containers?.filter((c) => c.state === "running").length ?? 0;
  const enabled = services?.filter((s) => s.enabled).length ?? 0;
  const total = services?.length ?? 0;

  const stats = [
    { label: "Containers running", value: `${running}/${containers?.length ?? 0}`, icon: Server, to: "/containers" },
    { label: "Services enabled", value: `${enabled}/${total}`, icon: Boxes, to: "/configure" },
    { label: "Docker daemon", value: docker ? "connected" : "mock mode", icon: Activity, to: "/deploy" },
  ];

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-[16px] font-semibold">Dashboard</h1>
      <div className="grid grid-cols-3 gap-3">
        {stats.map(({ label, value, icon: Icon, to }) => (
          <Link key={label} to={to} className="card p-4 hover:border-[var(--accent)] transition-colors">
            <div className="flex items-center justify-between">
              <span className="microlabel">{label}</span>
              <Icon size={14} strokeWidth={1.5} style={{ color: "var(--text-muted)" }} />
            </div>
            <div className="text-[26px] font-bold mt-1" style={{ color: "var(--accent)" }}>
              {value}
            </div>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="panel p-4">
          <div className="microlabel mb-2">Managed containers</div>
          {containers === null ? (
            <div className="text-[12px]" style={{ color: "var(--text-muted)" }}>loading…</div>
          ) : containers.length === 0 ? (
            <div className="text-[12px]" style={{ color: "var(--text-muted)" }}>
              No containers yet. Configure and deploy the stack first.
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              {containers.map((c) => (
                <Link
                  key={c.id}
                  to={`/containers/${c.id}`}
                  className="flex items-center justify-between h-8 px-2 rounded-md hover:bg-[var(--bg-hover)] text-[12px]"
                >
                  <span className="flex items-center gap-2">
                    <span
                      className={`dot ${
                        c.state === "running" ? "dot-ok" : c.state === "exited" ? "dot-idle" : "dot-err"
                      }`}
                    />
                    {c.name}
                  </span>
                  <span style={{ color: "var(--text-muted)" }}>{c.status}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
        <div className="panel p-4">
          <div className="microlabel mb-2">Core services</div>
          <div className="flex flex-col gap-1">
            {services
              ?.filter((s) => s.tier === "core")
              .map((s) => (
                <div key={s.id} className="flex items-center justify-between h-8 px-2 text-[12px]">
                  <span>{s.name}</span>
                  <span className={`badge ${s.enabled ? "badge-ok" : "badge-idle"}`}>
                    {s.enabled ? "enabled" : "off"}
                  </span>
                </div>
              ))}
          </div>
          <Link to="/configure" className="btn-accent inline-block mt-3 text-[12px]">
            Configure stack
          </Link>
        </div>
      </div>
    </div>
  );
}