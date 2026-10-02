import { useState, useEffect, type FormEvent } from "react";
import { api } from "../lib/api";

export default function Login({
  onAuth,
  setupComplete,
}: {
  onAuth: () => void;
  setupComplete: boolean;
}) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (!setupComplete) {
        if (password.length < 8) throw new Error("Password must be at least 8 characters");
        if (password !== confirm) throw new Error("Passwords do not match");
        await api("/api/setup", {
          method: "POST",
          body: JSON.stringify({ password, token: token || undefined }),
        });
        await api("/api/auth/login", { method: "POST", body: JSON.stringify({ password }) });
      } else {
        await api("/api/auth/login", { method: "POST", body: JSON.stringify({ password }) });
      }
      onAuth();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="h-screen w-screen flex items-center justify-center">
      <form onSubmit={submit} className="card w-80 p-6 flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center font-bold"
            style={{ background: "var(--accent)", color: "#181818" }}
          >
            S
          </div>
          <div>
            <div className="font-semibold text-[15px]">Staff Up</div>
            <div className="microlabel">{setupComplete ? "Sign in" : "Create admin password"}</div>
          </div>
        </div>
        <label className="microlabel">Admin password</label>
        <input
          className="input"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
        />
        {!setupComplete && (
          <>
            <label className="microlabel">Setup token</label>
            <input
              className="input"
              value={token}
              placeholder="printed by install.sh"
              onChange={(e) => setToken(e.target.value)}
            />
            <label className="microlabel">Confirm password</label>
            <input
              className="input"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </>
        )}
        {error && (
          <div className="badge badge-err self-start" style={{ textTransform: "none" }}>
            {error}
          </div>
        )}
        <button className="btn-accent" disabled={busy} type="submit">
          {setupComplete ? "Sign in" : "Set up"}
        </button>
      </form>
    </div>
  );
}