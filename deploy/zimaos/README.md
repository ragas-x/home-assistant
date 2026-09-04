# ZimaOS deployment

This deployment runs the dashboard and its local D1-compatible data store in Docker. It exposes a plain HTTP origin at `http://192.168.1.6:3000` for a Cloudflare Tunnel or another external reverse proxy.

## First installation

SSH into the ZimaOS server and clone the repository once:

```bash
mkdir -p /DATA/AppData/kitchen-dashboard
git clone https://github.com/ragas-x/home-assistant.git /DATA/AppData/kitchen-dashboard/source
cd /DATA/AppData/kitchen-dashboard/source
bash scripts/deploy-zimaos.sh
```

If the repository is private, authenticate Git on the server before cloning.
Run the deployment as your normal ZimaOS user when it has Docker access. If
`sudo` is required, the script automatically moves Docker's config away from
ZimaOS's read-only `/root` directory.

## Every later push

From the Windows development machine, use this instead of `git push`:

```powershell
.\scripts\push-and-deploy.ps1
```

The script only deploys after a successful push. Override the SSH user or server checkout path when needed:

```powershell
.\scripts\push-and-deploy.ps1 -User "your-zima-user" -RemotePath "/DATA/AppData/kitchen-dashboard/source"
```

Port `3000` is the default. If it is occupied, choose another unused port:

```powershell
.\scripts\push-and-deploy.ps1 -HttpPort 3001
```

## Enable voice on the iPad

Configure Cloudflare to proxy to `http://192.168.1.6:3000`, then open the public HTTPS hostname on the iPad and allow microphone access. The dashboard container itself does not manage TLS certificates.
