export interface ServiceField {
  key: string;
  label: string;
  type: "string" | "secret" | "email" | "number" | "boolean" | "select";
  required?: boolean;
  options?: string[];
  placeholder?: string;
}

export interface ServiceDef {
  id: string; // compose service name
  name: string;
  description: string;
  category: string;
  tier: "core" | "optional";
  image?: string;
  ports?: string[];
  /** subdomain under the root domain; null = no public UI (internal only) */
  subdomain: string | null;
  /** internal port the Traefik router targets */
  port?: number;
  volumes?: string[];
  dependsOn?: string[];
  extraEnv?: Record<string, string>;
  command?: string[];
  /** env vars the user must/can supply */
  fields?: ServiceField[];
  /** injected from global settings automatically */
  globalEnv?: { key: string; from: string }[];
  /** pure config integration, no container of its own */
  configOnly?: boolean;
}

export const SERVICES: ServiceDef[] = [
  {
    id: "traefik",
    name: "Traefik",
    description: "Edge router / reverse proxy with automatic TLS via Let's Encrypt.",
    category: "Core Infrastructure",
    tier: "core",
    image: "traefik:v3.3",
    subdomain: null,
    volumes: ["traefik-data:/letsencrypt"],
    command: [
      "--providers.docker=true",
      "--providers.docker.exposedbydefault=false",
      "--providers.docker.network=proxy",
      "--entrypoints.web.address=:80",
      "--entrypoints.websecure.address=:443",
      "--entrypoints.web.http.redirections.entrypoint.to=websecure",
      "--entrypoints.web.http.redirections.entrypoint.scheme=https",
      "--certificatesresolvers.le.acme.email=${ACME_EMAIL}",
      "--certificatesresolvers.le.acme.storage=/letsencrypt/acme.json",
      "--certificatesresolvers.le.acme.httpchallenge=true",
      "--certificatesresolvers.le.acme.httpchallenge.entrypoint=web",
      "--api.dashboard=false",
    ],
    ports: ["80:80", "443:443"],
    fields: [
      { key: "ACME_EMAIL", label: "Let's Encrypt email", type: "email", required: true },
    ],
  },
  {
    id: "postgres",
    name: "PostgreSQL",
    description: "Primary database for the suite's applications.",
    category: "Core Infrastructure",
    tier: "core",
    image: "postgres:17-alpine",
    subdomain: null,
    volumes: ["postgres-data:/var/lib/postgresql/data"],
    globalEnv: [
      { key: "POSTGRES_USER", from: "PG_USER" },
      { key: "POSTGRES_PASSWORD", from: "PG_PASSWORD" },
      { key: "POSTGRES_DB", from: "PG_DATABASE" },
    ],
  },
  {
    id: "authentik",
    name: "Authentik",
    description: "Identity provider / SSO (OIDC, SAML) guarding the suite's apps.",
    category: "Core Infrastructure",
    tier: "core",
    image: "ghcr.io/goauthentik/server:2025.2",
    subdomain: "auth",
    port: 9000,
    command: ["server"],
    volumes: ["authentik-data:/authentik/data", "authentik-media:/media", "authentik-certs:/certs"],
    dependsOn: ["postgres", "redis"],
    globalEnv: [
      { key: "AUTHENTIK_SECRET_KEY", from: "AUTHENTIK_SECRET" },
      { key: "AUTHENTIK_POSTGRESQL__HOST", from: "PG_HOST_LITERAL" },
      { key: "AUTHENTIK_POSTGRESQL__USER", from: "PG_USER" },
      { key: "AUTHENTIK_POSTGRESQL__PASSWORD", from: "PG_PASSWORD" },
      { key: "AUTHENTIK_POSTGRESQL__DATABASE", from: "AUTHENTIK_DB" },
    ],
    fields: [
      { key: "BOOTSTRAP_PASSWORD", label: "Admin (akadmin) password", type: "secret", required: true },
    ],
  },
  {
    id: "redis",
    name: "Redis",
    description: "Cache / session backend used by Authentik and other apps.",
    category: "Core Infrastructure",
    tier: "core",
    image: "redis:7-alpine",
    subdomain: null,
    command: ["redis-server", "--save", "60", "1", "--loglevel", "warning"],
    volumes: ["redis-data:/data"],
  },
  {
    id: "hermes-agent",
    name: "Hermes Agent",
    description:
      "Agentic workforce runtime (Hermes) on a Docker backend, wired to the internal overlay network.",
    category: "Core Infrastructure",
    tier: "core",
    image: "ghcr.io/nousresearch/hermes-agent:latest",
    subdomain: null,
    volumes: [
      "hermes-data:/data",
      "/var/run/docker.sock:/var/run/docker.sock",
      "./hermes:/profile",
    ],
    globalEnv: [
      { key: "HERMES_PROVIDER", from: "HERMES_PROVIDER" },
      { key: "HERMES_MODEL", from: "HERMES_MODEL" },
      { key: "HERMES_API_KEY", from: "HERMES_API_KEY" },
    ],
    fields: [
      { key: "HERMES_PROVIDER", label: "LLM provider", type: "select", required: true, options: ["openai", "anthropic", "openrouter", "nous"] },
      { key: "HERMES_MODEL", label: "Model", type: "string", required: true, placeholder: "claude-sonnet-4-5" },
      { key: "HERMES_API_KEY", label: "API key", type: "secret", required: true },
    ],
  },
  {
    id: "mattermost",
    name: "Mattermost",
    description: "Team chat where the agent workforce and humans collaborate.",
    category: "Core Infrastructure",
    tier: "core",
    image: "mattermost/mattermost-enterprise-edition:10.6",
    subdomain: "chat",
    port: 8065,
    volumes: ["mattermost-data:/var/mm/mattermost-data", "mattermost-config:/var/mm/mattermost-config"],
    dependsOn: ["postgres"],
    globalEnv: [
      { key: "MM_SQLSETTINGS_DATASOURCE", from: "MM_DATASOURCE" },
    ],
    fields: [],
  },
  {
    id: "tailscale",
    name: "Tailscale",
    description: "Mesh VPN for secure remote access to the suite.",
    category: "Core Infrastructure",
    tier: "core",
    image: "tailscale/tailscale:latest",
    subdomain: null,
    volumes: ["tailscale-data:/var/lib/tailscale"],
    ports: ["41641:41641/udp"],
    globalEnv: [
      { key: "TS_AUTHKEY", from: "TS_AUTHKEY" },
      { key: "TS_EXTRA_ARGS", from: "TS_EXTRA_ARGS" },
    ],
    fields: [
      { key: "TS_AUTHKEY", label: "Tailscale auth key", type: "secret", required: true },
      { key: "TS_EXTRA_ARGS", label: "Extra args", type: "string", placeholder: "--advertise-exit-node" },
    ],
  },

  // ---- Optional ----
  {
    id: "silo",
    name: "Silo (S3 storage)",
    description: "Object storage (MinIO fork) for files and backups.",
    category: "Storage",
    tier: "optional",
    image: "pgsty/silo:latest",
    subdomain: null,
    volumes: ["silo-data:/data"],
    ports: ["9001:9001", "9002:9002"],
    globalEnv: [
      { key: "MINIO_ROOT_USER", from: "SILO_USER" },
      { key: "MINIO_ROOT_PASSWORD", from: "SILO_PASSWORD" },
    ],
    fields: [
      { key: "SILO_USER", label: "Root user", type: "string", required: true },
      { key: "SILO_PASSWORD", label: "Root password", type: "secret", required: true },
    ],
  },
  {
    id: "akaunting",
    name: "Akaunting",
    description: "Self-hosted accounting (invoicing, expenses, reports).",
    category: "Finance",
    tier: "optional",
    image: "akaunting/akaunting:latest",
    subdomain: "accounting",
    port: 80,
    volumes: ["akaunting-data:/var/www/html"],
    dependsOn: ["postgres"],
  },
  {
    id: "nextcloud",
    name: "Nextcloud + Collabora",
    description: "Office suite: file sync/share with Collabora document editing.",
    category: "Office",
    tier: "optional",
    image: "nextcloud:31-apache",
    subdomain: "office",
    port: 80,
    volumes: ["nextcloud-data:/var/www/html"],
    dependsOn: ["postgres"],
    globalEnv: [
      { key: "POSTGRES_HOST", from: "PG_HOST_LITERAL" },
      { key: "POSTGRES_DB", from: "NEXTCLOUD_DB" },
      { key: "POSTGRES_USER", from: "PG_USER" },
      { key: "POSTGRES_PASSWORD", from: "PG_PASSWORD" },
    ],
  },
  {
    id: "collabora",
    name: "Collabora Online",
    description: "LibreOffice-based document server behind Nextcloud.",
    category: "Office",
    tier: "optional",
    image: "collabora/code:latest",
    subdomain: "collabora",
    port: 9980,
    extraEnv: { extra_params: "--o:ssl.enable=false --o:ssl.termination=true" },
    fields: [
      { key: "COLLABORA_ADMIN", label: "Admin user", type: "string", required: true },
      { key: "COLLABORA_PASSWORD", label: "Admin password", type: "secret", required: true },
    ],
  },
  {
    id: "orbit",
    name: "Orbit (Project Management)",
    description: "Project management for the team and the agents.",
    category: "Operations",
    tier: "optional",
    image: "orbitpm/orbit:latest",
    subdomain: "projects",
    port: 80,
    dependsOn: ["postgres"],
  },
  {
    id: "vaultwarden",
    name: "Vaultwarden",
    description: "Lightweight Bitwarden-compatible password/secrets manager.",
    category: "Security",
    tier: "optional",
    image: "vaultwarden/server:latest",
    subdomain: "vault",
    port: 80,
    volumes: ["vaultwarden-data:/data"],
    fields: [
      { key: "ADMIN_TOKEN", label: "Admin token", type: "secret", required: true },
    ],
  },
  {
    id: "mautic",
    name: "Mautic",
    description: "Marketing automation / social media management.",
    category: "Marketing",
    tier: "optional",
    image: "mautic/mautic:latest",
    subdomain: "marketing",
    port: 80,
    volumes: ["mautic-data:/var/www/html"],
    dependsOn: ["postgres"],
  },
  {
    id: "termix",
    name: "Termix",
    description: "SSH/browser-based server management for endpoints.",
    category: "Operations",
    tier: "optional",
    image: "lukegus/termix:latest",
    subdomain: "termix",
    port: 8080,
    volumes: ["termix-data:/app/data"],
  },
  {
    id: "portainer",
    name: "Portainer CE",
    description: "Docker container management dashboard.",
    category: "Operations",
    tier: "optional",
    image: "portainer/portainer-ce:latest",
    subdomain: "docker",
    port: 9443,
    volumes: ["portainer-data:/data", "/var/run/docker.sock:/var/run/docker.sock"],
  },
  {
    id: "twilio",
    name: "Twilio",
    description: "VoIP / SMS / fax integration (credentials only — no container).",
    category: "Communications",
    tier: "optional",
    configOnly: true,
    subdomain: null,
    fields: [
      { key: "TWILIO_ACCOUNT_SID", label: "Account SID", type: "string", required: true },
      { key: "TWILIO_AUTH_TOKEN", label: "Auth token", type: "secret", required: true },
      { key: "TWILIO_PHONE", label: "Phone number", type: "string" },
    ],
  },
  {
    id: "stripe",
    name: "Stripe",
    description: "Payments integration (credentials only — no container).",
    category: "Finance",
    tier: "optional",
    configOnly: true,
    subdomain: null,
    fields: [
      { key: "STRIPE_SECRET_KEY", label: "Secret key", type: "secret", required: true },
      { key: "STRIPE_WEBHOOK_SECRET", label: "Webhook signing secret", type: "secret" },
    ],
  },
  {
    id: "email",
    name: "Email (IMAP/SMTP)",
    description: "Outbound/inbound mail credentials used by apps and agents.",
    category: "Communications",
    tier: "core",
    configOnly: true,
    subdomain: null,
    fields: [
      { key: "SMTP_HOST", label: "SMTP host", type: "string", required: true },
      { key: "SMTP_PORT", label: "SMTP port", type: "number", required: true },
      { key: "SMTP_USER", label: "SMTP user", type: "email", required: true },
      { key: "SMTP_PASSWORD", label: "SMTP password", type: "secret", required: true },
      { key: "IMAP_HOST", label: "IMAP host", type: "string", required: true },
      { key: "IMAP_PORT", label: "IMAP port", type: "number", required: true },
      { key: "IMAP_USER", label: "IMAP user", type: "email", required: true },
      { key: "IMAP_PASSWORD", label: "IMAP password", type: "secret", required: true },
    ],
  },
];

export function getService(id: string): ServiceDef | undefined {
  return SERVICES.find((s) => s.id === id);
}

export const CORE_IDS = SERVICES.filter((s) => s.tier === "core").map((s) => s.id);