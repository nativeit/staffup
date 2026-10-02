import { useEffect, useState } from "react";
import { api } from "../lib/api";

export default function Settings() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [deployments, setDeployments] = useState<any[]>([]);

  useEffect(() => {
    api<any[]>("/api/deployments").then(setDeployments).catch(() => setDeployments([]));
  }, []);

  const changePassword = async () => {
    setMsg(null);
    setErr(null);
    if (password.length < 8) return setErr("Password must be at least 8 characters");
    if (password !== confirm) return setErr("Passwords do not match");
    // Admin password change re-uses the setup endpoint via a signed-in session;
    // password changes go through settings only when setup incomplete, so use login test first.
    try {
      // verify current session works, then update via setup endpoint is blocked;
      // simplest correct path: store new hash server-side through /api/settings/password
      await api("/api/settings/password", { method: "POST", body: JSON.stringify({ password }) });
      setMsg("Password updated");
      setPassword("");
      setConfirm("");
    } catch (e: any) {
      setErr(e.message);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-[16px] font-semibold">Settings</h1>

      <div className="panel p-4">
        <div className="microlabel mb-3">Change admin password</div>
        <div className="flex flex-col gap-3 max-w-sm">
          <input className="input" type="password" placeholder="New password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <input className="input" type="password" placeholder="Confirm new password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          {msg && <span className="badge badge-ok self-start">{msg}</span>}
          {err && <span className="badge badge-err self-start">{err}</span>}
          <button className="btn-accent self-start text-[12px]" onClick={changePassword}>
            Update password
          </button>
        </div>
      </div>

      <div className="panel">
        <div className="px-4 py-2 border-b microlabel" style={{ borderColor: "var(--border-subtle)" }}>
          Deployment history
        </div>
        {deployments.length === 0 ? (
          <div className="px-4 py-4 text-[12px]" style={{ color: "var(--text-muted)" }}>No deployments yet.</div>
        ) : (
          deployments.map((d) => (
            <div key={d.id} className="flex items-center justify-between px-4 py-2 border-b text-[12px] last:border-b-0" style={{ borderColor: "var(--border-subtle)" }}>
              <span className="flex items-center gap-2">
                <span className={`badge ${d.status === "success" ? "badge-ok" : d.status === "running" ? "badge-warn" : "badge-err"}`}>
                  {d.status}
                </span>
                {d.action}
              </span>
              <span style={{ color: "var(--text-muted)" }}>
                {d.started_at}{d.finished_at ? ` → ${d.finished_at}` : ""}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}