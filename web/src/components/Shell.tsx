import { NavLink, useNavigate } from "react-router-dom";
import { LayoutDashboard, Boxes, Rocket, Settings, LogOut, Server } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { api } from "../lib/api";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/configure", label: "Configure", icon: Boxes },
  { to: "/deploy", label: "Deploy", icon: Rocket },
  { to: "/containers", label: "Containers", icon: Server },
  { to: "/settings", label: "Settings", icon: Settings },
];

export default function Shell({ children }: { children: ReactNode }) {
  const [docker, setDocker] = useState<boolean | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    api<{ available: boolean }>("/api/docker/status").then((s) => setDocker(s.available));
  }, []);

  const logout = async () => {
    await api("/api/auth/logout", { method: "POST" });
    window.location.reload();
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      {/* Icon rail */}
      <div
        className="w-12 shrink-0 flex flex-col items-center py-3 gap-1 border-r"
        style={{ background: "var(--bg-rail)", borderColor: "var(--border-subtle)" }}
      >
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center font-bold text-sm mb-2"
          style={{ background: "var(--accent)", color: "#181818" }}
        >
          S
        </div>
        {NAV.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `w-9 h-9 rounded-md flex items-center justify-center ${
                isActive ? "" : "hover:bg-[var(--bg-hover)]"
              }`
            }
            style={({ isActive }) =>
              isActive
                ? { background: "var(--bg-hover)", color: "var(--accent)" }
                : { color: "var(--text-secondary)" }
            }
            title={label}
          >
            <Icon size={16} strokeWidth={1.5} />
          </NavLink>
        ))}
        <div className="flex-1" />
        <button
          onClick={logout}
          className="w-9 h-9 rounded-md flex items-center justify-center hover:bg-[var(--bg-hover)]"
          style={{ color: "var(--text-secondary)" }}
          title="Log out"
        >
          <LogOut size={16} strokeWidth={1.5} />
        </button>
      </div>

      {/* Sidebar */}
      <div
        className="w-56 shrink-0 flex flex-col border-r"
        style={{ background: "var(--bg-sidebar)", borderColor: "var(--border-subtle)" }}
      >
        <div className="h-[52px] flex items-center px-4 gap-2 border-b" style={{ borderColor: "var(--border-subtle)" }}>
          <span className="font-semibold text-[15px]">Staff Up</span>
        </div>
        <nav className="flex-1 py-2">
          {NAV.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center h-8 px-4 text-[12px] rounded-md mx-2 ${
                  isActive ? "" : "hover:bg-[var(--bg-hover)]"
                }`
              }
              style={({ isActive }) =>
                isActive
                  ? { background: "var(--bg-hover)", color: "var(--text-primary)" }
                  : { color: "var(--text-secondary)" }
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="px-4 py-3 border-t text-[11px]" style={{ borderColor: "var(--border-subtle)", color: "var(--text-muted)" }}>
          <div className="flex items-center gap-2">
            <span className={`dot ${docker ? "dot-ok" : "dot-err"}`} />
            {docker === null ? "checking docker…" : docker ? "Docker connected" : "Docker unavailable (mock mode)"}
          </div>
        </div>
      </div>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <main className="flex-1 overflow-auto p-4">{children}</main>
      </div>
    </div>
  );
}