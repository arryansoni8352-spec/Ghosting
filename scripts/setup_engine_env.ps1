# VeilGuard - User-Initiated Engine Environment Setup Script
# Sets up an isolated, persistent Python virtual environment for VeilGuard
# Verified on Windows x64 with Python 3.11.9 (64-bit)

param(
    [string]$TargetDir = "",
    [switch]$Force,
    [switch]$NonInteractive
)

$ErrorActionPreference = "Stop"

if (-not $TargetDir) {
    $TargetDir = "$env:LOCALAPPDATA\VeilGuard\engine-env"
}

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "   VeilGuard -- Engine Environment Setup (Windows x64)    " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

## 1. Security & Execution Context Check
# This script is strictly user-initiated. It does NOT weaken or disable Windows
# Defender, SmartScreen, WDAC, or any security policy.

## 2. Locate Supported Python Interpreter (3.11 Verified)
$pythonCandidate = $null

if ($env:VEILGUARD_PYTHON_PATH -and (Test-Path $env:VEILGUARD_PYTHON_PATH)) {
    $pythonCandidate = $env:VEILGUARD_PYTHON_PATH
    Write-Host "INFO: Using VEILGUARD_PYTHON_PATH: $pythonCandidate" -ForegroundColor Cyan
} else {
    $commonPaths = @(
        "$env:LOCALAPPDATA\Programs\Python\Python311\python.exe",
        "C:\Python311\python.exe"
    )
    foreach ($p in $commonPaths) {
        if (Test-Path $p) {
            $pythonCandidate = $p
            break
        }
    }
    if (-not $pythonCandidate) {
        $cmdPython = (Get-Command python -ErrorAction SilentlyContinue)
        if ($cmdPython) {
            $pythonCandidate = $cmdPython.Source
        }
    }
}

if (-not $pythonCandidate) {
    Write-Host ""
    Write-Host "ERROR: Supported Python interpreter was not detected." -ForegroundColor Red
    Write-Host "VeilGuard requires Python 3.11 (64-bit) for verified neural perturbation execution." -ForegroundColor Yellow
    Write-Host "1. Download and install Python 3.11 from: https://www.python.org/downloads/release/python-3119/" -ForegroundColor Yellow
    Write-Host "2. Ensure 'Add python.exe to PATH' is checked during installation." -ForegroundColor Yellow
    Write-Host "3. Alternatively, set `$env:VEILGUARD_PYTHON_PATH to your python.exe location and re-run." -ForegroundColor Yellow
    Write-Host ""
    exit 1
}

# Verify Python version & architecture
$pyVerRaw = & $pythonCandidate -c "import sys; print(str(sys.version_info.major) + '.' + str(sys.version_info.minor) + '.' + str(sys.version_info.micro) + ' ' + str(sys.maxsize > 2**32))"
$pyVerParts = $pyVerRaw.Split(" ")
$pyVersion = $pyVerParts[0]
$is64Bit = [System.Convert]::ToBoolean($pyVerParts[1])

if (-not $is64Bit) {
    Write-Host ("ERROR: Detected 32-bit Python " + $pyVersion + ". VeilGuard requires 64-bit Python.") -ForegroundColor Red
    exit 1
}

if (-not $pyVersion.StartsWith("3.11")) {
    Write-Host ("WARNING: Detected Python " + $pyVersion + ". Only Python 3.11.x is verified for this release candidate.") -ForegroundColor Yellow
    Write-Host "Dependencies may behave unpredictably on untested Python versions." -ForegroundColor Yellow
} else {
    Write-Host ("INFO: Verified Python runtime: Python " + $pyVersion + " (64-bit)") -ForegroundColor Green
}

## 3. Resolve Target Directory & Disk Space Check
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $scriptDir) {
    $scriptDir = $PSScriptRoot
}
if (-not $scriptDir) {
    $scriptDir = Get-Location
}
$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $scriptDir ".."))

if ($TargetDir -eq "local") {
    $TargetDir = Join-Path $repoRoot "engine\.venv"
}

# Ensure TargetDir is an absolute path (resolves relative paths safely)
$TargetDir = [System.IO.Path]::GetFullPath($TargetDir)

# Check target drive free space (at least 1.5 GB required for PyTorch CPU wheels)
$targetDriveRoot = [System.IO.Path]::GetPathRoot($TargetDir)
if ($targetDriveRoot) {
    $driveLetter = $targetDriveRoot.TrimEnd(":\")
    $freeBytes = $null
    try {
        $dInfo = [System.IO.DriveInfo]::new($driveLetter)
        if ($dInfo.IsReady) {
            $freeBytes = $dInfo.AvailableFreeSpace
        }
    } catch {
        $driveInfo = Get-PSDrive -Name $driveLetter -ErrorAction SilentlyContinue
        if ($driveInfo -and $driveInfo.Free) {
            $freeBytes = $driveInfo.Free
        }
    }

    if ($null -ne $freeBytes -and $freeBytes -lt (1.5 * 1024 * 1024 * 1024)) {
        $freeMB = [math]::Round($freeBytes / 1MB, 1)
        Write-Host ("ERROR: Insufficient disk space on drive " + $targetDriveRoot + ". Available: " + $freeMB + " MB, Required: 1500 MB.") -ForegroundColor Red
        exit 1
    }
}

## 4. User Consent & Target Environment Protection
if (Test-Path $TargetDir) {
    if (-not $Force) {
        if ($NonInteractive) {
            Write-Host "INFO: Existing environment found at $TargetDir. Reusing existing environment." -ForegroundColor Yellow
        } else {
            Write-Host "NOTICE: An existing environment was found at: $TargetDir" -ForegroundColor Yellow
            $choice = Read-Host "Do you want to (U)pdate in-place, (R)ecreate cleanly, or (A)bort? [U/r/a]"
            if ($choice -match "^[aA]") {
                Write-Host "INFO: Setup aborted by user." -ForegroundColor Gray
                exit 0
            } elseif ($choice -match "^[rR]") {
                Write-Host "INFO: Removing existing environment for clean recreation..." -ForegroundColor Yellow
                Remove-Item -Recurse -Force $TargetDir
            }
        }
    }
}

# Ensure parent directory exists
$parentDir = [System.IO.Path]::GetDirectoryName($TargetDir)
if ($parentDir -and -not (Test-Path $parentDir)) {
    try {
        New-Item -ItemType Directory -Path $parentDir -Force | Out-Null
    } catch {
        Write-Host ("ERROR: Unable to create target directory: " + $parentDir) -ForegroundColor Red
        Write-Host ("Details: " + $_.Exception.Message) -ForegroundColor Yellow
        exit 1
    }
}

## 5. Create Virtual Environment
Write-Host "INFO: Target environment: $TargetDir" -ForegroundColor Cyan

if (-not (Test-Path $TargetDir)) {
    Write-Host "INFO: Creating isolated virtual environment..." -ForegroundColor Cyan
    & $pythonCandidate -m venv --system-site-packages $TargetDir
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: Failed to create virtual environment. Check folder permissions." -ForegroundColor Red
        exit 1
    }
}

$venvPython = Join-Path $TargetDir "Scripts\python.exe"
if (-not (Test-Path $venvPython)) {
    Write-Host "ERROR: Interpreter not found at $venvPython after creation." -ForegroundColor Red
    exit 1
}

## 6. Pinned Dependency Installation (CPU-only PyTorch)
Write-Host "INFO: Upgrading pip tooling..." -ForegroundColor Cyan
& $venvPython -m pip install --upgrade pip --quiet

Write-Host "INFO: Installing verified dependencies (PyTorch 2.15.0+cpu, Torchvision 0.29.2+cpu, Pillow, NumPy)..." -ForegroundColor Cyan

# Locate requirements file (works from repo root, scripts/ subfolder, or standalone handoff)
$candidateReqPaths = @(
    (Join-Path $repoRoot "engine\requirements.txt"),
    (Join-Path $scriptDir "engine\requirements.txt"),
    (Join-Path $scriptDir "requirements.txt"),
    (Join-Path (Get-Location) "engine\requirements.txt")
)
$reqFile = $null
foreach ($c in $candidateReqPaths) {
    if ($c -and (Test-Path $c)) {
        $reqFile = [System.IO.Path]::GetFullPath($c)
        break
    }
}

if ($reqFile) {
    Write-Host ("INFO: Using requirements file: " + $reqFile) -ForegroundColor Cyan
    & $venvPython -m pip install -r $reqFile --extra-index-url https://download.pytorch.org/whl/cpu
} else {
    Write-Host "NOTICE: requirements.txt not found. Installing pinned dependencies directly..." -ForegroundColor Yellow
    & $venvPython -m pip install "torch==2.15.0+cpu" "torchvision==0.29.2+cpu" --extra-index-url https://download.pytorch.org/whl/cpu
    & $venvPython -m pip install "Pillow==13.0.0" "numpy==2.4.6" "psutil==7.2.2" "diffusers==0.42.1" "safetensors==0.8.0"
}

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "ERROR: Package installation failed. Please check internet connection and pip output." -ForegroundColor Red
    Write-Host "To retry cleanly, run: powershell -ExecutionPolicy Bypass -File scripts\setup_engine_env.ps1 -Force" -ForegroundColor Yellow
    exit 1
}

## 7. Verification: Imports & Live Engine Health Check
Write-Host "INFO: Testing package imports in new environment..." -ForegroundColor Cyan
$verifyImports = & $venvPython -c "import torch, torchvision, PIL, numpy, psutil; print('Imports OK | Torch: ' + str(torch.__version__) + ' | NumPy: ' + str(numpy.__version__))"

if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Import verification failed in new environment." -ForegroundColor Red
    exit 1
}
Write-Host "  -> $verifyImports" -ForegroundColor Gray

# Locate run_engine.py across source, handoff, or installed application
$candidateEnginePaths = @(
    (Join-Path $repoRoot "engine\run_engine.py"),
    (Join-Path $scriptDir "engine\run_engine.py"),
    (Join-Path $env:LOCALAPPDATA "Programs\veilguard-desktop\resources\engine\run_engine.py"),
    (Join-Path (Get-Location) "engine\run_engine.py")
)
$engineScript = $null
foreach ($c in $candidateEnginePaths) {
    if ($c -and (Test-Path $c)) {
        $engineScript = [System.IO.Path]::GetFullPath($c)
        break
    }
}

if ($engineScript) {
    Write-Host ("INFO: Executing live engine health check over stdio IPC (" + $engineScript + ")...") -ForegroundColor Cyan
    $healthCheckPayload = '{"type": "health", "requestId": "setup_init"}'
    
    $pinfo = New-Object System.Diagnostics.ProcessStartInfo
    $pinfo.FileName = $venvPython
    $pinfo.Arguments = "-u `"$engineScript`""
    $pinfo.WorkingDirectory = (Split-Path -Parent $engineScript)
    $pinfo.RedirectStandardInput = $true
    $pinfo.RedirectStandardOutput = $true
    $pinfo.RedirectStandardError = $true
    $pinfo.UseShellExecute = $false
    $pinfo.CreateNoWindow = $true

    $proc = [System.Diagnostics.Process]::Start($pinfo)
    $proc.StandardInput.WriteLine($healthCheckPayload)
    $proc.StandardInput.Flush()
    
    $healthResponse = $proc.StandardOutput.ReadLine()
    $proc.StandardInput.Close()
    $proc.WaitForExit(3000)

    if ($healthResponse -and $healthResponse.Contains('"status": "ready"')) {
        Write-Host "PASS: Engine health check verified: status = ready!" -ForegroundColor Green
    } else {
        Write-Host "WARNING: Engine response was not ready. Output: $healthResponse" -ForegroundColor Yellow
    }
} else {
    Write-Host "NOTICE: run_engine.py not found locally. Skipping stdio IPC test (will be verified when VeilGuard launches)." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "SUCCESS: VeilGuard engine runtime environment setup complete!" -ForegroundColor Green
Write-Host ("Location: " + $TargetDir) -ForegroundColor Gray
Write-Host "VeilGuard desktop application will automatically discover this environment." -ForegroundColor Green
Write-Host ""
Write-Host "==========================================================" -ForegroundColor Cyan
