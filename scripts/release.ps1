#requires -Version 5.1
<#
Stamps a build with the commit it was produced from and the upstream commit
it was last merged with, then builds the web bundle and optionally the image.

Only allowlisted build sources are staged. The working tree and local runtime
configuration are never copied as a unit. Web assets go to release-artifacts.

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
if ($version -notmatch '^[a-zA-Z0-9][a-zA-Z0-9._+-]{0,127}$') { throw 'Invalid release version.' }
$imageTag = $version.Replace('+', '-')

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

$stage = Join-Path $root ('.release-work-' + [Guid]::NewGuid().ToString('N'))
$releaseOutput = Join-Path (Join-Path $root 'release-artifacts') $version
$bundleTool = Join-Path $PSScriptRoot 'release_bundle.py'

try {
    if (-not $SkipWebBuild -and (Test-Path -LiteralPath $releaseOutput)) { throw 'Release output already exists. Preserve or move it before rebuilding.' }
    & python -B $bundleTool stage $stage
    if ($LASTEXITCODE -ne 0) { throw 'Release source manifest rejected.' }
    [System.IO.File]::WriteAllText((Join-Path $stage 'VERSION'), $version, [System.Text.Encoding]::ASCII)

    if (-not $SkipWebBuild) {
        Write-Host 'Building web bundle...' -ForegroundColor Cyan
        $buildEnvDefaults = [ordered]@{
            RAYON_NUM_THREADS    = '4'
            TOKIO_WORKER_THREADS = '4'
            UV_THREADPOOL_SIZE   = '4'
            NODE_OPTIONS         = '--max-old-space-size=3072'
        }
        $previousBuildEnv = @{}
        foreach ($key in $buildEnvDefaults.Keys) {
            $previousBuildEnv[$key] = [Environment]::GetEnvironmentVariable($key, 'Process')
            if ([string]::IsNullOrWhiteSpace($previousBuildEnv[$key])) {
                [Environment]::SetEnvironmentVariable($key, $buildEnvDefaults[$key], 'Process')
            }
        }
        $publicEnv = @(Get-ChildItem Env: | Where-Object { $_.Name -match '^(VITE_|PUBLIC_)' })
        foreach ($item in $publicEnv) { [Environment]::SetEnvironmentVariable($item.Name, $null, 'Process') }
        $env:VITE_REACT_APP_VERSION = $version
        $junction = Join-Path $stage 'web\node_modules'
        Push-Location (Join-Path $stage 'web')
        try {
            New-Item -ItemType Junction -Path $junction -Target (Join-Path $root 'web\node_modules') -ErrorAction Stop | Out-Null
            & node .\node_modules\@rsbuild\core\bin\rsbuild.js build --no-env
            if ($LASTEXITCODE -ne 0) { throw 'Web build failed' }
        } finally {
            Pop-Location
            if ([IO.Directory]::Exists($junction)) { [IO.Directory]::Delete($junction) }
            [Environment]::SetEnvironmentVariable('VITE_REACT_APP_VERSION', $null, 'Process')
            foreach ($item in $publicEnv) { [Environment]::SetEnvironmentVariable($item.Name, $item.Value, 'Process') }
            foreach ($key in $buildEnvDefaults.Keys) {
                [Environment]::SetEnvironmentVariable($key, $previousBuildEnv[$key], 'Process')
            }
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
        $distDir = Join-Path $stage 'web\dist'
        [System.IO.File]::WriteAllText((Join-Path $distDir 'version.json'), $manifest, (New-Object System.Text.UTF8Encoding($false)))
        New-Item -ItemType Directory -Path (Split-Path -Parent $releaseOutput) -Force | Out-Null
        [IO.Directory]::Move($distDir, $releaseOutput)
        Write-Host "Web release output: $releaseOutput" -ForegroundColor DarkGray
    }

    if ($Image) {
        Write-Host "Building image ${Image}:$imageTag ..." -ForegroundColor Cyan
        & docker build `
            --build-arg BUILD_CONCURRENCY=4 `
            --build-arg GO_BUILD_PARALLEL=4 `
            --build-arg GO_BUILD_MEMLIMIT=2GiB `
            -t "${Image}:$imageTag" `
            -t "${Image}:latest" `
            $stage
        if ($LASTEXITCODE -ne 0) { throw 'docker build failed' }

        if ($PushImage) {
            Write-Host "Pushing ${Image}:$imageTag ..." -ForegroundColor Cyan
            & docker push "${Image}:$imageTag"
            if ($LASTEXITCODE -ne 0) { throw 'docker push failed' }
            & docker push "${Image}:latest"
            if ($LASTEXITCODE -ne 0) { throw 'docker push failed' }
        }
    }
}
finally {
    if (Test-Path -LiteralPath $stage) {
        $resolvedStage = (Resolve-Path -LiteralPath $stage).Path
        if ((Split-Path -Parent $resolvedStage) -ne $root -or (Split-Path -Leaf $resolvedStage) -notmatch '^\.release-work-[a-f0-9]{32}$') { throw 'Unexpected staging path' }
        if (Test-Path -LiteralPath (Join-Path $resolvedStage 'web\node_modules')) { throw 'Cannot clean staging while dependency junction exists' }
        Remove-Item -LiteralPath $resolvedStage -Recurse -Force
    }
}

Write-Host ''
Write-Host 'Done.' -ForegroundColor Green
Write-Host "Verify after deploy: curl https://<host>/api/status  ->  version = $version"
Write-Host "Admin panel: /system-info -> Upstream sync"
