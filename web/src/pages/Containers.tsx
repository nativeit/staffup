import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Play, Square, RotateCw, RefreshCw } from "lucide-react";
import { api, type ContainerInfo } from "../lib/api";

export default function Containers() {
  const [containers, setContainers] = useState<ContainerInfo[] | null>(null);
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    api<ContainerInfo[]>("/api/containers").then(setContainers).catch(() => setContainers([]));
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load]);

  const act = async (c: ContainerInfo, action: "start" | "stop" | "restart") => {
    setBusy(c.id);
    try {
      await api(`/api/containers/${c.id}/${action}`, { method: "POST" });
      load();
    } finally {
      setBusy(null);
    }
  };

  const list = (containers ?? []).filter(
    (c) =>
      !filter ||
      c.name.toLowerCase().includes(filter.toLowerCase()) ||
      c.image.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-[16px] font-semibold">Containers</h1>
        <div className="flex items-center gap-2">
          <input
            className="input w-48"
            placeholder="filter…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          <button
            className="input w-auto flex items-center gap-1 cursor-pointer text-[12px]"
            onClick={load}
            title="Refresh"
          >
            <RefreshCw size={13} strokeWidth={1.5} />
          </button>
        </div>
      </div>

      <div className="panel">
        <div className="grid grid-cols-[1fr_1.4fr_100px_1.4fr_150px] px-4 py-2 border-b microlabel" style={{ borderColor: "var(--border-subtle)" }}>
          <span>Name</span>
          <span>Image</span>
          <span>State</span>
          <span>Status</span>
          <span className="text-right">Actions</span>
        </div>
        {containers === null ? (
          <div className="px-4 py-4 text-[12px]" style={{ color: "var(--text-muted)" }}>loading…</div>
        ) : list.length === 0 ? (
          <div className="px-4 py-4 text-[12px]" style={{ color: "var(--text-muted)" }}>
            No containers found. Deploy the stack to create them.
          </div>
        ) : (
          list.map((c) => (
            <div
              key={c.id}
              className="grid grid-cols-[1fr_1.4fr_100px_1.4fr_150px] items-center px-4 py-2 border-b text-[12px] hover:bg-[var(--bg-hover)] last:border-b-0"
              style={{ borderColor: "var(--border-subtle)" }}
            >
              <Link to={`/containers/${c.id}`} className="flex items-center gap-2 hover:text-[var(--accent)]">
                <span
                  className={`dot ${
                    c.state === "running" ? "dot-ok" : c.state === "exited" ? "dot-idle" : "dot-err"
                  }`}
                />
                <span className="truncate">{c.name}</span>
              </Link>
              <span className="truncate" style={{ color: "var(--text-muted)" }}>{c.image}</span>
              <span className={`badge ${c.state === "running" ? "badge-ok" : c.state === "exited" ? "badge-idle" : "badge-err"}`}>
                {c.state}
              </span>
              <span className="truncate" style={{ color: "var(--text-secondary)" }}>{c.status}</span>
              <div className="flex justify-end gap-1">
                {busy === c.id ? (
                  <RotateCw size={14} className="animate-spin" style={{ color: "var(--accent)" }} />
                ) : (
                  <>
                    <button
                      className="p-1 rounded hover:bg-[var(--bg-hover)]"
                      style={{ color: "var(--status-ok)" }}
                      title="Start"
                      onClick={() => act(c, "start")}
                    >
                      <Play size={14} strokeWidth={1.5} />
                    </button>
                    <button
                      className="p-1 rounded hover:bg-[var(--bg-hover)]"
                      style={{ color: "var(--status-err)" }}
                      title="Stop"
                      onClick={() => act(c, "stop")}
                    >
                      <Square size={14} strokeWidth={1.5} />
                    </button>
                    <button
                      className="p-1 rounded hover:bg-[var(--bg-hover)]"
                      style={{ color: "var(--text-secondary)" }}
                      title="Restart"
                      onClick={() => act(c, "restart")}
                    >
                      <RotateCw size={14} strokeWidth={1.5} />
                    </button>
                  </>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}