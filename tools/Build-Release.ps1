param(
    [string]$GitExe = "D:\Downloads\Programs\PortableGit\bin\git.exe",
    [string]$Output
)
$ErrorActionPreference = "Stop"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
if (!(Test-Path -LiteralPath $GitExe)) {
    $GitExe = (Get-Command git -ErrorAction Stop).Source
}
if (!$Output) {
    $Output = Join-Path (Split-Path $Root -Parent) ("PBZ-OutfitFrameworkCombined-v0.2.2-" + (Get-Date -Format yyyyMMdd-HHmmss) + ".zip")
}
$Output = [System.IO.Path]::GetFullPath($Output)
if (Test-Path -LiteralPath $Output) { throw "Output already exists: $Output" }
Push-Location $Root
try {
    $env:Path = "$(Split-Path $GitExe -Parent);$env:Path"
    & $GitExe lfs version
    if ($LASTEXITCODE -ne 0) { throw "Git LFS is not installed." }
    & $GitExe lfs pull
    if ($LASTEXITCODE -ne 0) { throw "Could not download LFS assets." }
    $env:PBZ_GIT_EXE = $GitExe
    & node (Join-Path $PSScriptRoot "verify.cjs")
    if ($LASTEXITCODE -ne 0) { throw "Validation failed. Nothing was packaged." }
    Compress-Archive -LiteralPath @((Join-Path $Root "ProjectPBZ"), (Join-Path $Root "README.md")) -DestinationPath $Output -CompressionLevel Fastest
    Write-Host "Verified mod package: $Output" -ForegroundColor Green
} finally {
    Pop-Location
}
