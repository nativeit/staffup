# Staff Up - A Full-Stack Business Suite + Agentic Support Team

This project is for the development of an automated suite of business applications and corresponding agentic AI "workforce" using Docker Compose. 

Users will define their desired configuration, options, and accounts using a GUI configuration tool that will automatically generate a Docker Compose spec to install, configure, and deploy a pre-configured, full-featured suite of integrated business software and Hermes agents that cover all of the most common business units like I.T., accounting, administration, sales, research & development, etc..

## Stack

### Core Features

- **Platform**: Docker
- **Orchestration**: Docker Compose
- **App Proxy**: Traefik
- **Agents**: Hermes w/Docker backend connected to an internal overlay network that allows profiles to communicate with one another
- **Databases**: PostgreSQL (alternatives incl. Supabase, local SQLite)
- **Identity/Directory**: Authentik
- **VPN**: Tailscale (alternatives incl. Zerotier, OpenVPN)
- **Email**: IMAP/SMTP
- **Chat Interface**: Mattermost (alternatives incl. Slack, Teams, Telegram)
- **Management GUI**: A browser-based GUI for installation, configuration, monitoring, and management of Staff Up and its apps.

### Configurable Options

- **File Storage**: [Silo](https://github.com/pgsty/silo) (fork of MinIO, alternatives incl. Amazon S3, local filesystem)
- **Accounting**: Akaunting (alternatives incl. Zoho Books, Quickbooks)
- **Telephony**: Twilio (for VoIP, SMS, and/or fax)
- **Office Suite**: Nextcloud+Collabora (alternatives incl. Google Workspace, Microsoft 365, Zoho)
- **Project Management**: Orbit (alternatives incl. Kanboard, Zoho Projects)
- **Payments**: Stripe (alternatives incl. Paypal, Zoho Payments)
- **Password/Secrets Manager**: Vaultwarden (alternatives incl. Bitwarden, 1Password)
- **Social Media Management**: Mautic
- **Endpoint Management**: Termix (alternatives incl. Remote Desktop Manager, Microsoft Entra)
- **Docker Management**: Portainer CE
- **More to come!**

## Getting Started

This project can be deployed on a **freshly provisioned** Debian/Ubuntu server using the `install.sh` script. Do NOT attempt to run the install script on an existing/in-use system, as it WILL BREAK things.

The install script will provision the web-based configuration GUI so that the user can:

1. Select which features to include
2. Set the relevant configuration options
3. Provide all necessary account details, OAuth credentials, and `.env` variables
4. Track the installation progress and (if necessary) troubleshoot any problems it encounters.

If everything has been configured correctly, the install script will install Docker, Docker Compose, UFW, Traefik, Hermes, Tailscale/Zerotier, and all of the various dependencies and supporting packages required. It will then deploy Docker Compose specifications for all of the core features, configure them with Traefik to ensure they're accessible, setup the intial Hermes agent to oversee the rest of the initial provisioning and deployments. 

The configuration GUI can then be used as a management dashboard and status monitoring interface, as well as a portal to add optional features and applications via one-click app deployments.

## Requirements

- Freshly provisioned Debian/Ubuntu server (current LTS release)
- Domain name with DNS that points all `*.example.com` subdomains to the server's IP address. The management GUI will use `mgmt.example.com`, and apps will be configured to use `appname.example.com` so Traefik can provision SSL certificates.
- Open ports `80/tcp` `443/tcp` `3000/tcp` #TODO: Add other ports from core services
- IMAP/SMTP Email
