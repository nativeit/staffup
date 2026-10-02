import { Routes, Route, Navigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { api } from "./lib/api";
import Shell from "./components/Shell";
import Dashboard from "./pages/Dashboard";
import Configure from "./pages/Configure";
import Containers from "./pages/Containers";
import ContainerDetail from "./pages/ContainerDetail";
import Settings from "./pages/Settings";
import Login from "./pages/Login";
import Deploy from "./pages/Deploy";

export default function App() {
  const [ready, setReady] = useState(false);
  const [setupComplete, setSetupComplete] = useState(false);
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    api<{ setupComplete: boolean }>("/api/auth/status")
      .then((s) => {
        setSetupComplete(s.setupComplete);
        setAuthed(s.setupComplete);
        setReady(true);
      })
      .catch(() => setReady(true));
    const onUnauthorized = () => setAuthed(false);
    window.addEventListener("staffup:unauthorized", onUnauthorized);
    return () => window.removeEventListener("staffup:unauthorized", onUnauthorized);
  }, []);

  const loginOk = () => setAuthed(true);

  if (!ready) return null;

  if (!setupComplete || !authed) {
    return <Login onAuth={loginOk} setupComplete={setupComplete} />;
  }

  return (
    <Shell>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/configure" element={<Configure />} />
        <Route path="/deploy" element={<Deploy />} />
        <Route path="/containers" element={<Containers />} />
        <Route path="/containers/:id" element={<ContainerDetail />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Shell>
  );
}