import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { api, type Service, type ServiceField } from "../lib/api";

export default function Configure() {
  const [global, setGlobal] = useState<Record<string, string>>({});
  const [services, setServices] = useState<Service[] | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [dirty, setDirty] = useState<Record<string, Record<string, string>>>({});
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api("/api/config").then((cfg: any) => {
      const { pgPasswordSet, ...rest } = cfg;
      setGlobal(rest);
    });
    api<Service[]>("/api/services").then(setServices);
  }, []);

  const saveGlobal = async () => {
    try {
      await api("/api/config", { method: "PUT", body: JSON.stringify(global) });
      setSaved("Global settings saved");
      setTimeout(() => setSaved(null), 2000);
    } catch (e: any) {
      setError(e.message);
    }
  };

  const toggleService = async (s: Service, enabled: boolean) => {
    await api(`/api/services/${s.id}/enabled`, { method: "PUT", body: JSON.stringify({ enabled }) });
    setServices((prev) => prev!.map((x) => (x.id === s.id ? { ...x, enabled } : x)));
  };

  const fieldChanged = (s: Service, key: string, value: string) => {
    setDirty((d) => ({ ...d, [s.id]: { ...d[s.id], [key]: value } }));
  };

  const saveService = async (s: Service) => {
    const values = dirty[s.id] ?? {};
    const next = { ...s.config, ...values };
    await api(`/api/services/${s.id}/config`, { method: "PUT", body: JSON.stringify(next) });
    setServices((prev) =>
      prev!.map((x) => (x.id === s.id ? { ...x, config: next, hasConfig: true } : x))
    );
    setDirty((d) => ({ ...d, [s.id]: {} }));
    setSaved(`${s.name} configuration saved`);
    setTimeout(() => setSaved(null), 2000);
  };

  const fieldInput = (s: Service, f: ServiceField) => {
    const value = dirty[s.id]?.[f.key] ?? s.config[f.key] ?? "";
    if (f.type === "select" && f.options) {
      return (
        <select
          className="input"
          value={value}
          onChange={(e) => fieldChanged(s, f.key, e.target.value)}
        >
          <option value="">— select —</option>
          {f.options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      );
    }
    return (
      <input
        className="input"
        type={f.type === "secret" ? "password" : f.type === "number" ? "number" : "text"}
        value={value}
        placeholder={f.placeholder}
        onChange={(e) => fieldChanged(s, f.key, e.target.value)}
      />
    );
  };

  const categories = [...new Set(services?.map((s) => s.category) ?? [])];

  return (
    <div className="flex flex-col gap-4 pb-8">
      <div className="flex items-center justify-between">
        <h1 className="text-[16px] font-semibold">Configuration</h1>
        {saved && <span className="badge badge-ok">{saved}</span>}
        {error && <span className="badge badge-err">{error}</span>}
      </div>

      {/* Global settings */}
      <div className="panel p-4">
        <div className="microlabel mb-3">Global settings</div>
        <div className="grid grid-cols-2 gap-3">
          {(
            [
              ["domain", "Root domain", "example.com"],
              ["acmeEmail", "Let's Encrypt email", "admin@example.com"],
              ["adminEmail", "Admin email", "admin@example.com"],
              ["timezone", "Timezone", "UTC"],
            ] as const
          ).map(([key, label, placeholder]) => (
            <label key={key} className="flex flex-col gap-1">
              <span className="microlabel">{label}</span>
              <input
                className="input"
                value={global[key] ?? ""}
                placeholder={placeholder}
                onChange={(e) => setGlobal({ ...global, [key]: e.target.value })}
              />
            </label>
          ))}
        </div>
        <button className="btn-accent mt-3 text-[12px]" onClick={saveGlobal}>
          Save global settings
        </button>
      </div>

      {/* Services by category */}
      {categories.map((cat) => (
        <div key={cat} className="panel">
          <div className="px-4 py-2 border-b microlabel" style={{ borderColor: "var(--border-subtle)" }}>
            {cat}
          </div>
          {(services ?? [])
            .filter((s) => s.category === cat)
            .map((s) => (
              <div key={s.id} className="border-b last:border-b-0" style={{ borderColor: "var(--border-subtle)" }}>
                <div className="flex items-center justify-between px-4 py-2 hover:bg-[var(--bg-hover)]">
                  <button
                    className="flex items-center gap-2 flex-1 text-left"
                    onClick={() => setOpen((o) => ({ ...o, [s.id]: !o[s.id] }))}
                  >
                    {open[s.id] ? (
                      <ChevronDown size={14} strokeWidth={1.5} style={{ color: "var(--text-muted)" }} />
                    ) : (
                      <ChevronRight size={14} strokeWidth={1.5} style={{ color: "var(--text-muted)" }} />
                    )}
                    <span className="text-[13px] font-medium">{s.name}</span>
                    {s.tier === "core" && <span className="badge badge-warn">core</span>}
                    {s.configOnly && <span className="badge badge-idle">config only</span>}
                    <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                      {s.description}
                    </span>
                  </button>
                  <div className="flex items-center gap-3">
                    {s.subdomain && (
                      <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                        {s.subdomain}.&lt;domain&gt;
                      </span>
                    )}
                    <span className={`badge ${s.enabled ? "badge-ok" : "badge-idle"}`}>
                      {s.enabled ? "enabled" : "off"}
                    </span>
                    <input
                      type="checkbox"
                      checked={s.enabled}
                      onChange={(e) => toggleService(s, e.target.checked)}
                      className="accent-[var(--accent)]"
                      title={`Enable ${s.name}`}
                    />
                  </div>
                </div>
                {open[s.id] && (s.fields.length > 0 || !s.configOnly) && (
                  <div className="px-10 pb-4 pt-1 flex flex-col gap-3" style={{ background: "var(--bg-panel)" }}>
                    {s.fields.length > 0 ? (
                      <div className="grid grid-cols-2 gap-3">
                        {s.fields.map((f) => (
                          <label key={f.key} className="flex flex-col gap-1">
                            <span className="microlabel">
                              {f.label}
                              {f.required && <span style={{ color: "var(--accent)" }}> *</span>}
                            </span>
                            {fieldInput(s, f)}
                          </label>
                        ))}
                      </div>
                    ) : (
                      <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                        No configuration required. Defaults apply on deploy.
                      </span>
                    )}
                    {s.fields.length > 0 && (
                      <button className="btn-accent self-start text-[12px]" onClick={() => saveService(s)}>
                        Save {s.name} settings
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
        </div>
      ))}
    </div>
  );
}