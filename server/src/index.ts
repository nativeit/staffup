import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import fastifyWebsocket from "@fastify/websocket";
import fastifyCookie from "@fastify/cookie";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  hasAdmin,
  setAdminPassword,
  verifySetupToken,
  login,
  verifySession,
  logout,
} from "./auth.js";
import { SERVICES, getService, CORE_IDS } from "./catalog.js";
import {
  getGlobalConfig,
  saveGlobalConfig,
  composeYaml,
  generateEnv,
  validateConfig,
} from "./compose.js";
import {
  getSetting,
  setSetting,
  getServiceRow,
  listServiceRows,
  setServiceEnabled,
  saveServiceConfig,
} from "./db.js";
import { driver, dockerAvailable } from "./docker.js";
import {
  deploy,
  getDeployState,
  onDeployEvent,
  recentDeployments,
} from "./deploy.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 3080);
const host = process.env.HOST || "0.0.0.0";

const app = Fastify({ logger: false, bodyLimit: 2 * 1024 * 1024 });
app.register(fastifyCookie);
app.register(fastifyWebsocket);

// ---- auth plumbing ----
function tokenFrom(req: any): string | undefined {
  const cookie = req.headers.cookie;
  if (cookie) {
    const m = /staffup_session=([^;]+)/.exec(cookie);
    if (m) return m[1];
  }
  const h = req.headers.authorization;
  if (h?.startsWith("Bearer ")) return h.slice(7);
  return undefined;
}

function authed(req: any): boolean {
  return verifySession(tokenFrom(req));
}

app.addHook("onRequest", async (req, reply) => {
  const url = (req as any).raw.url as string;
  const isSetup = url === "/api/setup" || url === "/api/auth/status";
  const isLogin = url === "/api/auth/login" || url.startsWith("/api/auth/status");
  if (url.startsWith("/api") && !isSetup && !isLogin && !authed(req)) {
    await reply.code(401).send({ error: "unauthorized" });
  }
});

app.get("/api/auth/status", async () => ({ setupComplete: hasAdmin() }));

app.post("/api/setup", async (req, reply) => {
  if (hasAdmin()) return reply.code(409).send({ error: "Setup already complete" });
  const { password, token } = (req.body as any) ?? {};
  if (!verifySetupToken(token))
    return reply.code(403).send({ error: "Invalid setup token" });
  if (!password || password.length < 8)
    return reply.code(400).send({ error: "Password must be at least 8 characters" });
  setAdminPassword(password);
  return { ok: true };
});

app.post("/api/auth/login", async (req, reply) => {
  const { password } = (req.body as any) ?? {};
  const token = login(password ?? "");
  if (!token) return reply.code(401).send({ error: "Invalid password" });
  reply.setCookie?.("staffup_session", token, {
    httpOnly: true,
    sameSite: "strict",
    path: "/",
    maxAge: 7 * 24 * 3600,
  });
  return { token };
});

app.post("/api/auth/logout", async (req, reply) => {
  logout(tokenFrom(req));
  reply.setCookie?.("staffup_session", "", { path: "/", maxAge: 0 });
  return { ok: true };
});

app.post("/api/settings/password", async (req, reply) => {
  const { password } = (req.body as any) ?? {};
  if (!password || password.length < 8)
    return reply.code(400).send({ error: "Password must be at least 8 characters" });
  setAdminPassword(password);
  return { ok: true };
});

// ---- global config ----
app.get("/api/config", async () => {
  const cfg = getGlobalConfig();
  // never leak secrets
  return { ...cfg, pg_password: undefined, pgPasswordSet: getSetting("pg_password") !== null };
});

app.put("/api/config", async (req) => {
  return saveGlobalConfig(req.body as any);
});

// ---- service catalog ----
app.get("/api/services", async () => {
  const rows = listServiceRows();
  return SERVICES.map((def) => {
    const row = rows.find((r) => r.id === def.id);
    const config = row ? JSON.parse(row.config) : {};
    return {
      id: def.id,
      name: def.name,
      description: def.description,
      category: def.category,
      tier: def.tier,
      configOnly: def.configOnly ?? false,
      subdomain: def.subdomain,
      image: def.image ?? null,
      fields: (def.fields ?? []).map((f) => ({
        key: f.key,
        label: f.label,
        type: f.type,
        required: f.required ?? false,
        options: f.options,
        placeholder: f.placeholder,
      })),
      enabled: (row?.enabled ?? 0) === 1,
      config,
      hasConfig: !!(row?.config && Object.keys(JSON.parse(row.config)).length),
    };
  });
});

app.put("/api/services/:id/enabled", async (req, reply) => {
  const def = getService((req.params as any).id);
  if (!def) return reply.code(404).send({ error: "Unknown service" });
  setServiceEnabled(def.id, (req.body as any).enabled === true);
  return { ok: true };
});

app.put("/api/services/:id/config", async (req, reply) => {
  const def = getService((req.params as any).id);
  if (!def) return reply.code(404).send({ error: "Unknown service" });
  saveServiceConfig(def.id, req.body as object);
  return { ok: true };
});

// ---- preview / validation ----
app.get("/api/stack/preview", async (req) => {
  if (!authed(req)) return;
  return { yaml: composeYaml(), env: generateEnv() };
});

app.get("/api/stack/validate", async () => validateConfig());

// ---- docker / containers ----
app.get("/api/docker/status", async () => ({
  available: dockerAvailable(),
}));

app.setNotFoundHandler(async (req, reply) => {
  if ((req as any).raw.url?.startsWith("/api"))
    return reply.code(404).send({ error: "not found" });
  return reply.sendFile("index.html");
});

app.get("/api/containers", async (req, reply) => {
  try {
    return await driver.listContainers();
  } catch (e: any) {
    return reply.code(503).send({ error: e.message });
  }
});

app.post("/api/containers/:id/:action", async (req, reply) => {
  const { id, action } = req.params as any;
  if (!["start", "stop", "restart"].includes(action))
    return reply.code(400).send({ error: "Invalid action" });
  try {
    await driver.action(id, action);
    return { ok: true };
  } catch (e: any) {
    return reply.code(503).send({ error: e.message });
  }
});

app.get("/api/containers/:id/logs", async (req) => {
  const tail = Number((req.query as any)?.tail ?? 200);
  return { logs: await driver.logs((req.params as any).id, Math.min(tail, 5000)) };
});

app.get("/api/containers/:id/stats", async (req) => {
  return { stats: await driver.stats((req.params as any).id) };
});

// ---- deploy ----
app.post("/api/deploy/:action", async (req, reply) => {
  const { action } = req.params as any;
  if (!["up", "down", "pull"].includes(action))
    return reply.code(400).send({ error: "Invalid action" });
  const state = await deploy(action as any);
  return state;
});

app.get("/api/deploy/state", async () => getDeployState());
app.get("/api/deployments", async () => recentDeployments());

// ---- live events over websocket ----
app.get("/api/ws/events", { websocket: true }, (socket, req) => {
  if (!authed(req)) {
    socket.close();
    return;
  }
  const un = onDeployEvent((state) => {
    socket.send(JSON.stringify({ type: "deploy", state }));
  });
  socket.on("close", un);
});

// ---- static frontend ----
const webDist = path.join(__dirname, "../../web/dist");
app.register(fastifyStatic, { root: webDist, prefix: "/" });

const start = async () => {
  // Seed core services as enabled so a fresh install validates once configured
  for (const id of CORE_IDS) {
    if (!getServiceRow(id)) setServiceEnabled(id, true);
  }
  try {
    await app.listen({ port, host });
    console.log(`Staff Up management GUI listening on http://${host}:${port}`);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};
start();