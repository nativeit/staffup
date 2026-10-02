import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Play, Square, RotateCw } from "lucide-react";
import { api, type ContainerInfo } from "../lib/api";

export default function ContainerDetail() {
  const { id = "" } = useParams();
  const [info, setInfo] = useState<ContainerInfo | null>(null);
  const [logs, setLogs] = useState("");
  const [stats, setStats] = useState<any>(null);
  const [follow, setFollow] = useState(true);

  const loadLogs = async () => {
    const r = await api<{ logs: string }>(`/api/containers/${id}/logs?tail=500`);
    setLogs(r.logs);
  };

  useEffect(() => {
    api<ContainerInfo[]>("/api/containers").then((cs) => {
      setInfo(cs.find((c) => c.id === id) ?? null);
    });
    loadLogs();
    const t = setInterval(loadLogs, 3000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (info?.state !== "running") return;
    const t = setInterval(() => {
      api<{ stats: any }>(`/api/containers/${id}/stats`).then((r) => setStats(r.stats));
    }, 4000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, info?.state]);

  const act = async (action: "start" | "stop" | "restart") => {
    await api(`/api/containers/${id}/${action}`, { method: "POST" });
    const cs = await api<ContainerInfo[]>("/api/containers");
    setInfo(cs.find((c) => c.id === id) ?? null);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/containers" className="p-1 rounded hover:bg-[var(--bg-hover)]" style={{ color: "var(--text-secondary)" }}>
            <ArrowLeft size={16} strokeWidth={1.5} />
          </Link>
          <h1 className="text-[16px] font-semibold">{info?.name ?? id.slice(0, 12)}</h1>
          {info && (
            <span
              className={`badge ${
                info.state === "running" ? "badge-ok" : info.state === "exited" ? "badge-idle" : "badge-err"
              }`}
            >
              {info.state}
            </span>
          )}
        </div>
        <div className="flex gap-2">
          {(["start", "stop", "restart"] as const).map((a) => (
            <button key={a} className="input w-auto cursor-pointer text-[12px] flex items-center gap-1" onClick={() => act(a)}>
              {a === "start" ? <Play size={12} strokeWidth={1.5} /> : a === "stop" ? <Square size={12} strokeWidth={1.5} /> : <RotateCw size={12} strokeWidth={1.5} />}
              {a}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="card p-3">
          <div className="microlabel">Image</div>
          <div className="text-[12px] mt-1 truncate">{info?.image ?? "—"}</div>
        </div>
        <div className="card p-3">
          <div className="microlabel">Status</div>
          <div className="text-[12px] mt-1">{info?.status ?? "—"}</div>
        </div>
        <div className="card p-3">
          <div className="microlabel">Resource usage</div>
          <div className="text-[12px] mt-1">
            {stats
              ? `${stats.cpuPercent}% CPU · ${stats.memUsedMb}/${stats.memLimitMb} MB (${stats.memPercent}%)`
              : info?.state === "running"
                ? "measuring…"
                : "—"}
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="flex items-center justify-between px-4 py-2 border-b" style={{ borderColor: "var(--border-subtle)" }}>
          <span className="microlabel">Logs</span>
          <label className="flex items-center gap-2 text-[11px]" style={{ color: "var(--text-secondary)" }}>
            <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} className="accent-[var(--accent)]" />
            auto-refresh
          </label>
        </div>
        <pre
          className="p-4 text-[11px] leading-[1.5] overflow-auto max-h-[60vh] whitespace-pre-wrap"
          style={{ background: "var(--bg-terminal)", color: "var(--text-secondary)" }}
        >
          {logs || "No log output."}
        </pre>
      </div>
    </div>
  );
}