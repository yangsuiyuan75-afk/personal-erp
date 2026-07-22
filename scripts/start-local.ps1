$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath '.env')) {
    Copy-Item -LiteralPath '.env.example' -Destination '.env'
    Write-Warning '已创建 .env，请先修改数据库密码与 JWT 密钥。'
}

docker compose up -d postgres
pnpm install
pnpm prisma:generate
pnpm prisma:migrate
pnpm dev
