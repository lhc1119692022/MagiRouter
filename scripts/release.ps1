#requires -Version 5.1
<#
Stamps a build with the commit it was produced from and the upstream commit
it was last merged with, then builds the web bundle and optionally the image.

The stamp is written into the tracked VERSION file only for the duration of
the build, because the Go binary embeds it via `-X common.Version=...`.
The working tree is restored afterwards, so the repository stays clean.

Version format:
    v1.0.0-rc.51+sha.<our commit>.up.<upstream commit>

Examples:
    .\scripts\release.ps1
    .\scripts\release.ps1 -Image ghcr.io/lhc1119692022/magirouter -PushImage
#>
[CmdletBinding()]
param(
    # Release part of the version. Defaults to the newest upstream tag.
    [string]$ReleasePart = '',

    [switch]$SkipWebBuild,

    # Optional container image name, e.g. ghcr.io/user/magirouter
    [string]$Image = '',

    [switch]$PushImage
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function Get-Trimmed([string]$command) {
    $output = & cmd /c $command
    if ($LASTEXITCODE -ne 0) {
        throw "Command failed: $command"
    }
    return ($output | Out-String).Trim()
}

$dirty = (& git status --porcelain) | Where-Object { $_ -ne '' }
if ($dirty) {
    Write-Host 'Working tree is not clean. Commit or stash first:' -ForegroundColor Yellow
    $dirty | Select-Object -First 20 | ForEach-Object { Write-Host "  $_" }
    throw 'Refusing to stamp a dirty tree: the build would not match any commit.'
}

Write-Host 'Fetching upstream...' -ForegroundColor Cyan
& git fetch upstream --prune --tags --quiet
if ($LASTEXITCODE -ne 0) { throw 'git fetch upstream failed' }

$commit = (Get-Trimmed 'git rev-parse HEAD').Substring(0, 10)
$upstreamHead = (Get-Trimmed 'git rev-parse upstream/main').Substring(0, 10)
$base = (Get-Trimmed 'git merge-base HEAD upstream/main').Substring(0, 10)
$branch = Get-Trimmed 'git rev-parse --abbrev-ref HEAD'

$behind = [int](Get-Trimmed "git rev-list --count $base..upstream/main")

if (-not $ReleasePart) {
    $tag = & git describe --tags --abbrev=0 upstream/main 2>$null
    if ($LASTEXITCODE -eq 0 -and $tag) {
        $ReleasePart = $tag.Trim()
    } else {
        throw 'No upstream tag found. Pass -ReleasePart explicitly, e.g. v1.0.0-rc.51'
    }
}

$version = "$ReleasePart+sha.$commit.up.$base"

Write-Host ''
Write-Host '  branch        : ' -NoNewline; Write-Host $branch
Write-Host '  commit        : ' -NoNewline; Write-Host $commit
Write-Host '  upstream base : ' -NoNewline; Write-Host $base
Write-Host '  upstream head : ' -NoNewline; Write-Host $upstreamHead
Write-Host '  behind        : ' -NoNewline; Write-Host "$behind commit(s)"
Write-Host '  version       : ' -NoNewline; Write-Host $version -ForegroundColor Green
Write-Host ''

if ($behind -gt 0) {
    Write-Host "Note: upstream/main has $behind commit(s) not merged into this build." -ForegroundColor Yellow
    Write-Host '      The deployed admin panel will show the same gap.' -ForegroundColor Yellow
    Write-Host ''
}

$versionFile = Join-Path $root 'VERSION'
$originalVersion = if (Test-Path $versionFile) { Get-Content $versionFile -Raw } else { '' }

try {
    [System.IO.File]::WriteAllText($versionFile, $version, [System.Text.Encoding]::ASCII)

    if (-not $SkipWebBuild) {
        Write-Host 'Building web bundle...' -ForegroundColor Cyan
        Push-Location (Join-Path $root 'web')
        try {
            & node .\node_modules\@rsbuild\core\bin\rsbuild.js build
            if ($LASTEXITCODE -ne 0) { throw 'Web build failed' }
        } finally {
            Pop-Location
        }

        $manifest = [ordered]@{
            version      = $version
            commit       = $commit
            upstreamBase = $base
            upstreamHead = $upstreamHead
            behind       = $behind
            branch       = $branch
            builtAt      = (Get-Date).ToUniversalTime().ToString('o')
        } | ConvertTo-Json
        $distDir = Join-Path $root 'web\dist'
        if (Test-Path $distDir) {
            [System.IO.File]::WriteAllText((Join-Path $distDir 'version.json'), $manifest, (New-Object System.Text.UTF8Encoding($false)))
            Write-Host "Wrote web/dist/version.json" -ForegroundColor DarkGray
        }
    }

    if ($Image) {
        Write-Host "Building image ${Image}:$version ..." -ForegroundColor Cyan
        & docker build -t "${Image}:$version" -t "${Image}:latest" $root
        if ($LASTEXITCODE -ne 0) { throw 'docker build failed' }

        if ($PushImage) {
            Write-Host "Pushing ${Image}:$version ..." -ForegroundColor Cyan
            & docker push "${Image}:$version"
            if ($LASTEXITCODE -ne 0) { throw 'docker push failed' }
            & docker push "${Image}:latest"
            if ($LASTEXITCODE -ne 0) { throw 'docker push failed' }
        }
    }
}
finally {
    [System.IO.File]::WriteAllText($versionFile, $originalVersion, [System.Text.Encoding]::ASCII)
}

Write-Host ''
Write-Host 'Done.' -ForegroundColor Green
Write-Host "Verify after deploy: curl https://<host>/api/status  ->  version = $version"
Write-Host "Admin panel: /system-info -> Upstream sync"
