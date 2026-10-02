import { useEffect, useState } from "react";
import { Play, Square, RefreshCw, Download } from "lucide-react";
import { api, type DeployState } from "../lib/api";

export default function Deploy() {
  const [state, setState] = useState<DeployState | null>(null);
  const [validation, setValidation] = useState<{ ok: boolean; missing: string[] } | null>(null);
  const [preview, setPreview] = useState<string>("");

  useEffect(() => {
    api<DeployState>("/api/deploy/state").then(setState);
    api<{ ok: boolean; missing: string[] }>("/api/stack/validate").then(setValidation);
    api<{ yaml: string }>("/api/stack/preview").then((p) => setPreview(p.yaml));
  }, []);

  const run = async (action: "up" | "down" | "pull") => {
    const next = await api<DeployState>(`/api/deploy/${action}`, { method: "POST" });
    setState({ ...next });
    const v = await api<{ ok: boolean; missing: string[] }>("/api/stack/validate");
    setValidation(v);
  };

  const statusBadge =
    state?.status === "running"
      ? "badge-warn"
      : state?.status === "success"
        ? "badge-ok"
        : state?.status === "error"
          ? "badge-err"
          : "badge-idle";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-[16px] font-semibold">Deployment</h1>
        <div className="flex items-center gap-2">
          <button className="btn-accent text-[12px] flex items-center gap-1" onClick={() => run("up")}>
            <Play size={13} strokeWidth={1.5} /> Deploy stack
          </button>
          <button
            className="input flex items-center gap-1 w-auto text-[12px] cursor-pointer"
            onClick={() => run("pull")}
            title="Pull latest images"
          >
            <Download size={13} strokeWidth={1.5} /> Pull
          </button>
          <button
            className="input flex items-center gap-1 w-auto text-[12px] cursor-pointer"
            onClick={() => run("down")}
            title="Tear down the stack"
          >
            <Square size={13} strokeWidth={1.5} /> Tear down
          </button>
        </div>
      </div>

      {validation && (
        <div className={`panel p-3 text-[12px] ${validation.ok ? "" : "border-[var(--status-err)]"}`}>
          {validation.ok ? (
            <span style={{ color: "var(--status-ok)" }}>✓ Configuration complete — ready to deploy</span>
          ) : (
            <div>
              <span style={{ color: "var(--status-err)" }}>Configuration incomplete — missing:</span>
              <ul className="list-disc ml-5 mt-1" style={{ color: "var(--text-secondary)" }}>
                {validation.missing.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="panel">
        <div className="flex items-center justify-between px-4 py-2 border-b" style={{ borderColor: "var(--border-subtle)" }}>
          <div className="flex items-center gap-2">
            <span className="microlabel">Deploy log</span>
            <span className={`badge ${statusBadge}`}>{state?.status ?? "idle"}</span>
            {state?.action && (
              <span className="microlabel">{state.action}</span>
            )}
          </div>
        </div>
        <pre
          className="p-4 text-[11px] leading-[1.5] overflow-auto max-h-96 whitespace-pre-wrap"
          style={{ background: "var(--bg-terminal)", color: "var(--text-secondary)" }}
        >
          {state?.log || "No deploy run yet."}
        </pre>
      </div>

      <div className="panel">
        <div className="px-4 py-2 border-b microlabel" style={{ borderColor: "var(--border-subtle)" }}>
          Generated docker-compose.yml (preview)
        </div>
        <pre
          className="p-4 text-[11px] leading-[1.5] overflow-auto max-h-96"
          style={{ background: "var(--bg-terminal)", color: "var(--text-secondary)" }}
        >
          {preview || "Enable services in Configure to generate the compose spec."}
        </pre>
      </div>
    </div>
  );
}