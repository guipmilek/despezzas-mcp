# Deployment Notes

This MCP server needs a public HTTPS URL, outbound HTTPS access to Despezzas and Firebase, and secret environment variables. It is a poor fit for static hosting. It can run on long-running Node services, containers, serverless Express functions, or behind a Python FastMCP proxy on Prefect Horizon when OAuth state is signed with a stable `MCP_OAUTH_TOKEN_SECRET`.

## Required Runtime Settings

Use these settings on every remote provider:

```dotenv
MCP_TRANSPORT=http
HOST=0.0.0.0
MCP_OAUTH_TOKEN_SECRET=<long-random-secret>
MCP_OAUTH_ACCESS_TOKEN_TTL_SECONDS=3600
```

Set `MCP_PUBLIC_BASE_URL=https://your-public-host` if OAuth discovery returns the wrong host or protocol behind the provider proxy. Otherwise the server can infer the public base URL from forwarded request headers.

For Despezzas authentication, choose one:

- Ephemeral/scale-to-zero hosting: set `DESPEZZAS_EMAIL`, `DESPEZZAS_PASSWORD`, and `DESPEZZAS_SESSION_FILE=none`.
- Durable hosting with a mounted volume: set `DESPEZZAS_SESSION_FILE` to a path on the mounted volume, then use `/login` once.

Do not commit Despezzas credentials. Add them only in the provider secrets UI.

## Current Repo Support

- Native Node deploys can use `npm ci --include=dev && npm run build`, then `node dist/index.js`.
- `render.yaml` is included for Render Blueprints.
- `railway.json` is included for Railway.
- `vercel.json` plus `api/index.js` is included for Vercel Functions.
- `Dockerfile` is included for Koyeb, Cloud Run, Fly.io, Northflank, Railway Docker deploys, or a VM.
- `horizon_proxy.py` plus `requirements.txt` is included for Prefect Horizon as a FastMCP proxy in front of a deployed Node backend.
- `/health` is ready for provider health checks.
- `/mcp` is the ChatGPT MCP server URL.
- OAuth discovery endpoints are exposed under `/.well-known/*`.

## Best Free Choices For This MCP

1. Oracle Cloud Always Free VM
   Best "actually free and stable" option if you are comfortable managing a small VM. It gives persistent disk and an always-on process, so the MCP login/session model behaves most naturally. Tradeoff: more ops work, SSH, firewall, Docker/systemd, and TLS setup.

2. Google Cloud Run
   Best managed container option with official MCP hosting guidance and a generous request-based free tier. It scales to zero, gives HTTPS, and is low maintenance. Use `DESPEZZAS_EMAIL`/`DESPEZZAS_PASSWORD`, `DESPEZZAS_SESSION_FILE=none`, and `MCP_OAUTH_TOKEN_SECRET` because instances are stateless.

3. Vercel Hobby
   Good free Git-based option with Vercel's MCP-specific guidance for Functions, OAuth metadata, and MCP hosts. This repo uses an Express function adapter instead of the `mcp-handler` example because the server already exists in `@modelcontextprotocol/sdk`.

4. Prefect Horizon
   Best MCP-native gateway option if you want managed hosting, auth, access control, registry, Inspector, and ChatMCP testing. Horizon expects a Python FastMCP entrypoint, so this repo includes a proxy that forwards to a Node backend already deployed on Cloud Run, Vercel, Render, or similar.

5. Koyeb Free Instance
   Good managed container/Git option. It has an automatic free-instance sleep behavior after idle time, but cold starts are intended to be quick. Use the Dockerfile or Node buildpack.

6. Render Free Web Service
   Easiest GitHub-to-URL path and good for MVP testing. The catch is that free web services spin down after 15 minutes and lose local filesystem changes on restarts/spin-downs. Use the included `render.yaml`, set Despezzas credentials as secrets, and keep `DESPEZZAS_SESSION_FILE=none`.

7. Railway Free
   Very smooth developer experience and can attach a small volume, but the free plan is usage-credit based. Good for testing and short-lived personal use, less ideal as a forever-free always-on service.

8. Northflank Developer Sandbox
   Solid container platform for experimentation. The free sandbox is explicitly for testing/hobby exploration, not production. Good fallback if you like its dashboard.

Community discussion also points to Cloudflare Workers, AWS, Supabase, Zapier, and purpose-built MCP platforms. Those are worth watching, but this repo is not currently adapted for Cloudflare Workers' runtime or low-code MCP builders.

Avoid Netlify/static hosts for this repo as-is. The current server is an Express MCP service with OAuth routes and cannot be served as static files.

## Render

The included `render.yaml` configures:

- Free web service
- Node runtime
- Build: `npm ci --include=dev && npm run build`
- Start: `node dist/index.js`
- Health check: `/health`
- `MCP_TRANSPORT=http`
- `HOST=0.0.0.0`
- Generated `MCP_OAUTH_TOKEN_SECRET`

After creating the Blueprint, fill these Render secret placeholders:

```dotenv
DESPEZZAS_EMAIL=<your-email>
DESPEZZAS_PASSWORD=<your-password>
MCP_PUBLIC_BASE_URL=https://your-service.onrender.com
```

Then connect in ChatGPT:

- Server URL: `https://your-service.onrender.com/mcp`
- Authentication: OAuth

## Railway

The included `railway.json` uses the Dockerfile and `/health`.

Set variables:

```dotenv
MCP_TRANSPORT=http
HOST=0.0.0.0
MCP_OAUTH_TOKEN_SECRET=<long-random-secret>
DESPEZZAS_EMAIL=<your-email>
DESPEZZAS_PASSWORD=<your-password>
DESPEZZAS_SESSION_FILE=none
```

Generate a Railway public domain, then optionally set:

```dotenv
MCP_PUBLIC_BASE_URL=https://your-service.up.railway.app
```

If you add a Railway volume, mount it at `/data` and use:

```dotenv
DESPEZZAS_SESSION_FILE=/data/session.json
```

## Vercel

The included `vercel.json` routes every request to `api/index.js`, which imports the built Express app from `dist/index.js`.

Vercel's MCP guide shows `mcp-handler` with a Next.js route such as `/api/mcp`. This repo keeps the existing Express MCP server and rewrites all paths to the Vercel Function, so the deployed MCP endpoint remains `/mcp`. Keeping `/mcp` at the root also keeps OAuth protected-resource discovery simple for ChatGPT.

Recommended project settings:

- Framework Preset: Other
- Install Command: `npm ci`
- Build Command: `npm run build`
- Output Directory: leave empty

Set variables:

```dotenv
MCP_OAUTH_TOKEN_SECRET=<long-random-secret>
MCP_OAUTH_ACCESS_TOKEN_TTL_SECONDS=3600
DESPEZZAS_EMAIL=<your-email>
DESPEZZAS_PASSWORD=<your-password>
DESPEZZAS_SESSION_FILE=none
MCP_PUBLIC_BASE_URL=https://your-project.vercel.app
```

`MCP_TRANSPORT` and `HOST` are not required for Vercel because Vercel imports the Express app instead of starting `node dist/index.js`. You may still set `MCP_TRANSPORT=http` for consistency.

Then connect in ChatGPT:

- Server URL: `https://your-project.vercel.app/mcp`
- Authentication: OAuth

Vercel Functions are stateless and scale down to zero, so do not rely on the `/login` session file there. Use Despezzas env credentials or add durable storage later.

## Prefect Horizon

Horizon is an MCP-native deployment platform from the FastMCP team. It provides managed hosting, authentication, access control, registry, Inspector, and ChatMCP testing, with a free personal tier described in the FastMCP docs.

Important fit note: Horizon deploys Python FastMCP servers. This project is a TypeScript/Node MCP server, so `horizon_proxy.py` is a small FastMCP proxy that forwards Horizon traffic to a Node backend hosted elsewhere.

Deploy flow:

1. Deploy the Node backend to Cloud Run, Vercel, Render, Koyeb, Railway, or a VM.
2. Protect that backend with a static bearer token:

   ```dotenv
   MCP_HTTP_BEARER_TOKEN=<long-random-backend-secret>
   ```

3. In Horizon, select this GitHub repository and configure:

   - Entrypoint: `horizon_proxy.py:mcp`
   - Authentication: enabled

4. Add Horizon environment variables:

   ```dotenv
   DESPEZZAS_MCP_BACKEND_URL=https://your-node-backend.example.com/mcp
   DESPEZZAS_MCP_BACKEND_TOKEN=<same-long-random-backend-secret>
   ```

5. Use the Horizon MCP URL, typically:

   ```text
   https://your-server-name.fastmcp.app/mcp
   ```

For this path, Horizon is the public MCP auth layer and the Node backend is the private implementation layer. Do not put Despezzas credentials in Horizon unless you intentionally port the actual Despezzas MCP implementation to Python later.

## Koyeb

Use the Dockerfile or native Node buildpack. Required settings are the same:

```dotenv
MCP_TRANSPORT=http
HOST=0.0.0.0
MCP_OAUTH_TOKEN_SECRET=<long-random-secret>
DESPEZZAS_EMAIL=<your-email>
DESPEZZAS_PASSWORD=<your-password>
DESPEZZAS_SESSION_FILE=none
MCP_PUBLIC_BASE_URL=https://your-app-your-org.koyeb.app
```

Koyeb exposes a public domain through `KOYEB_PUBLIC_DOMAIN`, so you can also set `MCP_PUBLIC_BASE_URL` to `https://{{ KOYEB_PUBLIC_DOMAIN }}` if using Koyeb variable interpolation.

## Cloud Run

Use the Dockerfile. Cloud Run is stateless by default, so use env credentials and no session file:

```dotenv
MCP_TRANSPORT=http
HOST=0.0.0.0
MCP_OAUTH_TOKEN_SECRET=<long-random-secret>
DESPEZZAS_EMAIL=<your-email>
DESPEZZAS_PASSWORD=<your-password>
DESPEZZAS_SESSION_FILE=none
MCP_PUBLIC_BASE_URL=https://your-cloud-run-url
```

For direct ChatGPT custom-app use, Cloud Run must be reachable by ChatGPT, so deploy the service publicly and rely on the MCP OAuth layer for `/mcp`:

```powershell
gcloud run deploy despezzas-mcp --source . --region=us-central1 --allow-unauthenticated
```

For internal/local MCP clients, Google's MCP guidance recommends IAM-protected Cloud Run services:

```powershell
gcloud run deploy despezzas-mcp --source . --region=us-central1 --no-allow-unauthenticated
gcloud run services proxy despezzas-mcp --region=us-central1 --port=3000
```

That IAM-protected mode is stronger for local clients, but it is not suitable for direct ChatGPT connection unless ChatGPT can provide a Google-issued ID token for your Cloud Run service. For ChatGPT, use public Cloud Run plus MCP OAuth, or put Prefect Horizon in front of the backend.

## Generate Secrets

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

## Sources

- OpenAI Apps SDK deployment docs: https://developers.openai.com/apps-sdk/deploy
- Render free service limits: https://render.com/docs/free
- Render Node/Express deployment docs: https://render.com/docs/deploy-node-express-app
- Render Blueprint docs: https://render.com/docs/blueprint-spec
- Railway Express deployment docs: https://docs.railway.com/guides/express
- Railway pricing/docs: https://docs.railway.com/pricing
- Railway public networking docs: https://docs.railway.com/networking/public-networking
- Koyeb Express deployment docs: https://www.koyeb.com/docs/deploy/express
- Koyeb scale-to-zero docs: https://www.koyeb.com/docs/run-and-scale/scale-to-zero
- Google Cloud Run pricing/free tier: https://cloud.google.com/run/pricing
- Oracle Always Free resources: https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm
- Northflank free sandbox docs: https://northflank.com/docs/v1/application/billing/pricing-on-northflank
- Vercel Express deployment docs: https://vercel.com/docs/frameworks/backend/express
- Vercel Functions docs: https://vercel.com/docs/functions
- Vercel Functions limits: https://vercel.com/docs/functions/limitations
- Vercel MCP deployment docs: https://vercel.com/docs/mcp/deploy-mcp-servers-to-vercel
- Google Cloud Run MCP hosting docs: https://cloud.google.com/run/docs/host-mcp-servers
- Google Cloud MCP on Cloud Run blog: https://cloud.google.com/blog/topics/developers-practitioners/build-and-deploy-a-remote-mcp-server-to-google-cloud-run-in-under-10-minutes
- Prefect Horizon / FastMCP deployment docs: https://gofastmcp.com/deployment/prefect-horizon
- FastMCP proxy provider docs: https://gofastmcp.com/servers/providers/proxy
- Community discussion on MCP deployment platforms: https://www.reddit.com/r/mcp/comments/1qh1tlt/platforms_for_easy_mcp_deployment/
