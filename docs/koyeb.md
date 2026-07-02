# Koyeb Free Deployment

Koyeb Free is the fallback free host for this repo. It runs the existing `Dockerfile`, so the Node/Express HTTP server is deployed without a Worker-specific build.

## Fit

Koyeb Free is good for testing and hobby use:

- 512 MB RAM, 0.1 vCPU, and 2 GB SSD.
- One Free Instance per organization.
- Free Instance region is Frankfurt or Washington, D.C.
- Free Instances cannot use volumes, custom scaling, or Koyeb Worker Services.
- Free Instances scale down to zero after 1 hour without traffic.

Because it scales down and cannot attach persistent volumes, use Despezzas env credentials and disable session-file persistence.

## Deploy From GitHub

1. Push this repo to GitHub.
2. In Koyeb, create an App.
3. Choose GitHub as the deployment method.
4. Select `guipmilek/despezzas-mcp`.
5. Builder: `Dockerfile`.
6. Dockerfile path: `Dockerfile`.
7. Instance type: `Free`.
8. Region: Washington, D.C. or Frankfurt.
9. Exposed port: `8787`.
10. HTTP route: `/`.
11. Health check path: `/health`.

## Environment Variables

Set these in Koyeb:

```dotenv
MCP_TRANSPORT=http
HOST=0.0.0.0
PORT=8787
MCP_OAUTH_TOKEN_SECRET=<long-random-secret>
MCP_OAUTH_ACCESS_TOKEN_TTL_SECONDS=3600
DESPEZZAS_EMAIL=<your-email>
DESPEZZAS_PASSWORD=<your-password>
DESPEZZAS_SESSION_FILE=none
```

After Koyeb gives you the public domain, set:

```dotenv
MCP_PUBLIC_BASE_URL=https://<your-app>-<your-org>.koyeb.app
```

If Koyeb's forwarded headers are correct, the server can infer this URL. Setting it explicitly makes OAuth discovery less surprising.

Generate the OAuth secret locally:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

## Connect ChatGPT

In ChatGPT Apps / Custom Tool:

- Name: `Despezzas`
- Server URL: `https://<your-app>-<your-org>.koyeb.app/mcp`
- Authentication: `OAuth`

Expect the first request after idle time to be slower because the Free Instance scales down to zero.

