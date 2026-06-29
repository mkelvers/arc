# Security Policy

## Supported Versions

This is a personal portfolio project, so there is no formal long-term support schedule. Security
fixes are applied to the current main branch when issues are confirmed and within the practical
maintenance capacity of the project.

## Reporting A Vulnerability

Please do not open a public issue for a security vulnerability.

Report security concerns privately to the repository maintainer. Include as much detail as you can:

- a description of the vulnerability;
- steps to reproduce the issue;
- affected routes, commands, files, or configuration;
- the potential impact;
- any suggested fix or mitigation, if you have one.

You can expect a best-effort response acknowledging the report, followed by validation and a fix
when the issue is reproducible and in scope.

## Security Scope

The most important security areas for this project are:

- local authentication and session handling;
- watchlist and playback progress data;
- playback proxy tokens and signed stream access;
- subtitle and playlist proxying;
- external provider integration boundaries;
- SQLite database access and migrations;
- configuration loaded from environment variables or `.env` files.

Reports involving these areas are especially useful.

## Out Of Scope

The following are generally out of scope unless they expose a direct application vulnerability:

- issues that require full local machine access;
- denial-of-service reports against a local development server;
- vulnerabilities in third-party services outside this repository;
- missing production hardening for deployments that are not documented or supported by the project;
- social engineering or physical attacks.

## Operational Notes

This application is designed to be self-hosted and local-first. If you deploy it beyond a private
local environment, you are responsible for the surrounding production controls, including TLS,
network access, backups, secrets management, reverse proxy configuration, logging retention, and
dependency monitoring.

Use a strong `PLAYBACK_PROXY_SECRET` if playback proxy token signing is enabled. Do not commit real
secrets, provider tokens, session data, or production databases to the repository.

The read-only `/api/public/users/{user_id}/watchlist` endpoint intentionally exposes watchlist
statuses, episode progress, and watchlist dates without authentication. Restrict `/api/public/` at
the network or reverse-proxy layer when that data should not be public.

## Dependency Security

Dependencies are managed through Go modules and Bun. When updating dependencies, run the normal
local checks before merging:

```bash
just check
```

Security-related dependency updates should be kept small and reviewed separately when possible.
