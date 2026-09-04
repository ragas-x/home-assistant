param(
  [string]$Server = "192.168.1.6",
  [string]$User = "root",
  [string]$RemotePath = "/DATA/AppData/kitchen-dashboard/source",
  [string]$Branch = "master",
  [int]$HttpPort = 3000
)

$ErrorActionPreference = "Stop"

git push origin $Branch
if ($LASTEXITCODE -ne 0) {
  throw "Git push failed; deployment was not started."
}

$remoteCommand = "cd '$RemotePath' && DEPLOY_BRANCH='$Branch' KITCHEN_HTTP_PORT='$HttpPort' bash scripts/deploy-zimaos.sh"
ssh "$User@$Server" $remoteCommand
if ($LASTEXITCODE -ne 0) {
  throw "The push succeeded, but the ZimaOS deployment failed."
}

Write-Host "Deployed origin to http://${Server}:$HttpPort"
