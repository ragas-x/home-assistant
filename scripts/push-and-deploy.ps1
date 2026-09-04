param(
  [string]$Server = "192.168.1.6",
  [string]$User = "root",
  [string]$RemotePath = "/DATA/AppData/kitchen-dashboard/source",
  [string]$Branch = "master"
)

$ErrorActionPreference = "Stop"

git push origin $Branch
if ($LASTEXITCODE -ne 0) {
  throw "Git push failed; deployment was not started."
}

$remoteCommand = "cd '$RemotePath' && DEPLOY_BRANCH='$Branch' bash scripts/deploy-zimaos.sh"
ssh "$User@$Server" $remoteCommand
if ($LASTEXITCODE -ne 0) {
  throw "The push succeeded, but the ZimaOS deployment failed."
}

Write-Host "Deployed to https://${Server}:8443"
