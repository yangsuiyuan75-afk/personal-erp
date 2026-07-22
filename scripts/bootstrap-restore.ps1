param(
    [Parameter(Mandatory = $true)]
    [string]$BackupPath,

    [string]$Container = 'personal-erp-postgres',
    [string]$Database = 'personal_erp',
    [string]$DbUser = 'personal_erp',
    [string]$DatabaseUrl = '',

    [Parameter(Mandatory = $true)]
    [string]$ConfirmPhrase
)

$ErrorActionPreference = 'Stop'

if ($Database -notmatch '^[A-Za-z0-9_]+$' -or $DbUser -notmatch '^[A-Za-z0-9_]+$') {
    throw 'Database and user names may contain only letters, digits, and underscores.'
}
if ($ConfirmPhrase -ne "BOOTSTRAP RESTORE $Database") {
    throw "Confirmation mismatch. Enter: BOOTSTRAP RESTORE $Database"
}

$resolvedBackup = (Resolve-Path -LiteralPath $BackupPath).Path
if ([IO.Path]::GetExtension($resolvedBackup) -ne '.dump') {
    throw 'Bootstrap restore accepts only .dump files.'
}
$bytes = [IO.File]::ReadAllBytes($resolvedBackup)
if ($bytes.Length -lt 5) { throw 'The backup file is too small.' }
$header = $bytes[0..4]
if ([Text.Encoding]::ASCII.GetString($header) -ne 'PGDMP') {
    throw 'The file is not PostgreSQL custom format (PGDMP header missing).'
}

$hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $resolvedBackup).Hash.ToLowerInvariant()
$manifestPath = [IO.Path]::Combine(
    [IO.Path]::GetDirectoryName($resolvedBackup),
    ([IO.Path]::GetFileNameWithoutExtension($resolvedBackup) + '.manifest.json')
)
if (Test-Path -LiteralPath $manifestPath) {
    $manifest = Get-Content -Raw -Encoding utf8 -LiteralPath $manifestPath | ConvertFrom-Json
    if ($manifest.sha256 -and $manifest.sha256.ToLowerInvariant() -ne $hash) {
        throw 'SHA-256 does not match the manifest. Restore blocked.'
    }
}

$exists = docker exec $Container psql -U $DbUser -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$Database'"
if ($LASTEXITCODE -ne 0) { throw 'Could not inspect the target database.' }
if ([string]::IsNullOrWhiteSpace([string]$exists)) {
    docker exec $Container createdb -U $DbUser $Database
    if ($LASTEXITCODE -ne 0) { throw 'Could not create the target database.' }
}

$businessTable = docker exec $Container psql -U $DbUser -d $Database -tAc "SELECT to_regclass('public.`"AdminUser`"')"
if ($LASTEXITCODE -ne 0) { throw 'Could not inspect the target schema.' }
if (-not [string]::IsNullOrWhiteSpace([string]$businessTable)) {
    throw 'The target already contains Personal ERP. Use the authenticated PRE_RESTORE flow.'
}

$catalogPath = [IO.Path]::GetTempFileName()
try {
    $catalogProcess = Start-Process -FilePath 'docker' -ArgumentList @(
        'exec', '-i', $Container, 'pg_restore', '--list'
    ) -RedirectStandardInput $resolvedBackup -RedirectStandardOutput $catalogPath -NoNewWindow -Wait -PassThru
    if ($catalogProcess.ExitCode -ne 0) { throw 'pg_restore catalog verification failed.' }
    if (-not (Select-String -LiteralPath $catalogPath -Pattern 'TABLE' -Quiet)) {
        throw 'The backup catalog does not contain application tables.'
    }
} finally {
    Remove-Item -LiteralPath $catalogPath -Force -ErrorAction SilentlyContinue
}

$restoreProcess = Start-Process -FilePath 'docker' -ArgumentList @(
    'exec', '-i', $Container, 'pg_restore',
    '-U', $DbUser,
    '-d', $Database,
    '--clean', '--if-exists', '--no-owner', '--no-acl', '--exit-on-error', '--single-transaction'
) -RedirectStandardInput $resolvedBackup -NoNewWindow -Wait -PassThru
if ($restoreProcess.ExitCode -ne 0) { throw 'pg_restore failed.' }

if ($DatabaseUrl) {
    $env:DATABASE_URL = $DatabaseUrl
    try {
        pnpm --filter '@personal-erp/server' exec prisma migrate deploy --schema prisma/schema.prisma
        if ($LASTEXITCODE -ne 0) { throw 'Prisma migration compatibility check failed.' }
    } finally {
        Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
    }
}

$health = docker exec $Container psql -U $DbUser -d $Database -tAc 'SELECT 1'
if ($LASTEXITCODE -ne 0 -or ([string]$health).Trim() -ne '1') {
    throw 'Post-restore database health check failed.'
}

Write-Host "Bootstrap restore complete. SHA-256: $hash"
Write-Host 'Start Personal ERP and verify the administrator login and critical records.'
