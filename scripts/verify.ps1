param(
    [string]$EvidenceRoot = "evidence\local-machine"
)

$ErrorActionPreference = "Stop"

function New-DirectorySafe {
    param([string]$Path)
    if (-not (Test-Path $Path)) {
        New-Item -ItemType Directory -Path $Path -Force | Out-Null
    }
}

function Safe {
    param(
        [Parameter(Mandatory=$true)][string]$Name,
        [Parameter(Mandatory=$true)][scriptblock]$Block
    )
    try {
        return [ordered]@{
            ok = $true
            name = $Name
            value = & $Block
            error = $null
        }
    } catch {
        return [ordered]@{
            ok = $false
            name = $Name
            value = $null
            error = [ordered]@{
                type = $_.Exception.GetType().FullName
                message = $_.Exception.Message
            }
        }
    }
}

function Write-Json {
    param(
        [Parameter(Mandatory=$true)]$Object,
        [Parameter(Mandatory=$true)][string]$Path,
        [int]$Depth = 8
    )
    $Object | ConvertTo-Json -Depth $Depth | Set-Content -Encoding UTF8 $Path
}

function Get-NextRunPath {
    param([string]$Root)
    $existing = Get-ChildItem -Path $Root -Filter "run-*.json" -ErrorAction SilentlyContinue
    $max = 0
    foreach ($f in $existing) {
        if ($f.BaseName -match '^run-(\d+)$') {
            $n = [int]$matches[1]
            if ($n -gt $max) { $max = $n }
        }
    }
    return (Join-Path $Root ("run-{0}.json" -f ($max + 1).ToString("000")))
}

# Write boundary
New-DirectorySafe $EvidenceRoot
$timestamp = (Get-Date).ToString("o")

$environment = [ordered]@{
    timestamp = $timestamp
    user = $env:USERNAME
    powershell = @{
        edition = $PSVersionTable.PSEdition
        version = $PSVersionTable.PSVersion.ToString()
    }
}

$environmentPath = Join-Path $EvidenceRoot "environment.json"
Write-Json -Object $environment -Path $environmentPath

$wfslExecutionContext = [ordered]@{
    timestamp = $timestamp
    invocation = $MyInvocation.Line
    scriptPath = $MyInvocation.MyCommand.Path
}

$executionContextPath = Join-Path $EvidenceRoot "execution-context.json"
Write-Json -Object $wfslExecutionContext -Path $executionContextPath

$runPath = Get-NextRunPath -Root $EvidenceRoot

$runEvidence = [ordered]@{
    timestamp = $timestamp
    status = "completed"
    notes = "wfsl-route-sentinel verification run"
    outputs = [ordered]@{
        environment = $environmentPath
        executionContext = $executionContextPath
    }
}

Write-Json -Object $runEvidence -Path $runPath

Write-Output "WFSL verification run completed"
Write-Output "Evidence root: $EvidenceRoot"
Write-Output "Run artefact: $runPath"
