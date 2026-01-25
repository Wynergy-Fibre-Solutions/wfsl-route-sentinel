param (
    [string]$Target = "8.8.8.8",
    [int]$Samples = 30
)

$latencies = @()
$lost = 0

for ($i = 0; $i -lt $Samples; $i++) {
    try {
        $r = Test-Connection -ComputerName $Target -Count 1 -ErrorAction Stop
        $latencies += $r.ResponseTime
    } catch {
        $lost++
    }
    Start-Sleep -Milliseconds 300
}

$total = $Samples
$lossPercent = [Math]::Round(($lost / $total) * 100, 2)

if ($latencies.Count -gt 0) {
    $min = ($latencies | Measure-Object -Minimum).Minimum
    $max = ($latencies | Measure-Object -Maximum).Maximum
    $avg = [Math]::Round(($latencies | Measure-Object -Average).Average, 0)
} else {
    $min = $null
    $max = $null
    $avg = $null
}

if ($lossPercent -gt 10) {
    $status = "BROKEN"
} elseif ($max -gt 500 -or $avg -gt 200) {
    $status = "DEGRADED"
} else {
    $status = "HEALTHY"
}

$report = @{
    wfsl = @{
        component = "route-sentinel"
        version = "0.1.0"
        timestampUtc = (Get-Date).ToUniversalTime().ToString("o")
    }
    network = @{
        target = $Target
        samples = $Samples
        latencyMs = @{
            min = $min
            avg = $avg
            max = $max
        }
        packetLossPercent = $lossPercent
        classification = $status
    }
}

$report | ConvertTo-Json -Depth 5

switch ($status) {
    "HEALTHY"  { exit 0 }
    "DEGRADED" { exit 1 }
    "BROKEN"   { exit 2 }
}
