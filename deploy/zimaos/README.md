# ZimaOS deployment

This deployment runs the dashboard and its local D1-compatible data store in Docker. Caddy exposes it at `https://192.168.1.6:8443`, which is required for microphone access on iPadOS.

## First installation

SSH into the ZimaOS server and clone the repository once:

```bash
mkdir -p /DATA/AppData/kitchen-dashboard
git clone https://github.com/ragas-x/home-assistant.git /DATA/AppData/kitchen-dashboard/source
cd /DATA/AppData/kitchen-dashboard/source
bash scripts/deploy-zimaos.sh
```

If the repository is private, authenticate Git on the server before cloning.

## Every later push

From the Windows development machine, use this instead of `git push`:

```powershell
.\scripts\push-and-deploy.ps1
```

The script only deploys after a successful push. Override the SSH user or server checkout path when needed:

```powershell
.\scripts\push-and-deploy.ps1 -User "your-zima-user" -RemotePath "/DATA/AppData/kitchen-dashboard/source"
```

## Enable voice on the iPad

Caddy creates a private certificate authority for local HTTPS. After the first deployment, copy this certificate from the server to the iPad:

```text
/DATA/AppData/kitchen-dashboard/caddy/pki/authorities/local/root.crt
```

Install the profile on the iPad, then enable it under **Settings → General → About → Certificate Trust Settings**. Open the dashboard at `https://192.168.1.6:8443` and allow microphone access.

The private key under the same Caddy directory must remain on the server and must never be copied or shared.
