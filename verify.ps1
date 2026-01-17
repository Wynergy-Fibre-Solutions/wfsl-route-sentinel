Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Get-Sha256Hex {
  param([string]$Path)
  if (-not (Test-Path -LiteralPath $Path)) { return "" }
  return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

function Read-FirstLine {
  param([string]$Path)
  if (-not (Test-Path -LiteralPath $Path)) { return "" }
  return (Get-Content -LiteralPath $Path -TotalCount 1 -ErrorAction Stop)
}

$repoPath = (Get-Location).Path

$requiredFiles = @(
  "LICENSE",
  "README.md",
  "GOVERNANCE.md",
  "VERIFICATION.md"
)

$missing = @()
foreach ($f in $requiredFiles) {
  if (-not (Test-Path -LiteralPath (Join-Path $repoPath $f))) {
    $missing += $f
  }
}

$licensePath = Join-Path $repoPath "LICENSE"
$licenseFirst = Read-FirstLine $licensePath
$licenseText = ""
if (Test-Path -LiteralPath $licensePath) {
  $licenseText = (Get-Content -LiteralPath $licensePath -Raw -ErrorAction Stop)
}

$licenseLooksApache =
  ($licenseFirst -match "Apache License") -and
  ($licenseText -match "Version 2\.0")

$head = ""
$remote = ""
try { $head = (git rev-parse HEAD 2>$null).Trim() } catch {}
try { $remote = (git config --get remote.origin.url 2>$null).Trim() } catch {}

$files = @()
foreach ($f in $requiredFiles) {
  $p = Join-Path $repoPath $f
  $files += [pscustomobject]@{
    path = $f
    exists = (Test-Path -LiteralPath $p)
    sha256 = (Get-Sha256Hex $p)
  }
}

$nowUtc = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH-mm-ss-fffZ")

$result = [pscustomobject]@{
  wfsl_verification = "WFSL-LOCAL-VERIFY-v1"
  repo = [pscustomobject]@{
    path = $repoPath
    remote = $remote
    head = $head
  }
  timestamp_utc = $nowUtc
  checks = [pscustomobject]@{
    required_files_present = ($missing.Count -eq 0)
    missing_files = $missing
    license_apache_2_0_detected = $licenseLooksApache
  }
  artifacts = [pscustomobject]@{
    required_files = $files
  }
  outcome = [pscustomobject]@{
    pass = (($missing.Count -eq 0) -and $licenseLooksApache)
  }
}

$evidenceDir = Join-Path $repoPath "evidence"
if (-not (Test-Path -LiteralPath $evidenceDir)) {
  New-Item -ItemType Directory -Path $evidenceDir | Out-Null
}

$evidencePath = Join-Path $evidenceDir ("wfsl-verify-" + $nowUtc + ".json")
$result | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $evidencePath -Encoding UTF8

if ($result.outcome.pass) {
  Write-Host "WFSL VERIFY: PASS"
  Write-Host ("Evidence: " + $evidencePath)
  exit 0
} else {
  Write-Host "WFSL VERIFY: FAIL"
  Write-Host ("Missing: " + ($missing -join ", "))
  Write-Host ("Apache-2.0 detected: " + $licenseLooksApache)
  Write-Host ("Evidence: " + $evidencePath)
  exit 1
}
