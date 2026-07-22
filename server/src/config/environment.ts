export interface Environment {
  nodeEnv: string;
  port: number;
  webOrigin: string;
}

export function validateEnvironment(raw: Record<string, unknown>): Record<string, unknown> {
  const port = Number(raw.APP_PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('APP_PORT 必须是 1 到 65535 之间的整数');
  }

  if (!raw.DATABASE_URL) {
    throw new Error('缺少 DATABASE_URL');
  }

  const microsoftClientId = String(raw.MICROSOFT_CLIENT_ID ?? '').trim();
  if (
    microsoftClientId &&
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(microsoftClientId)
  ) {
    throw new Error('MICROSOFT_CLIENT_ID 必须是有效的应用程序 Client ID');
  }
  const authority = String(
    raw.MICROSOFT_AUTHORITY ?? 'https://login.microsoftonline.com/consumers',
  ).replace(/\/$/, '');
  if (authority !== 'https://login.microsoftonline.com/consumers') {
    throw new Error('MICROSOFT_AUTHORITY 必须使用 consumers authority');
  }
  const rootFolder = String(raw.ONEDRIVE_ROOT_FOLDER ?? 'ERP_STORAGE').trim();
  if (!rootFolder || /[\\/:*?"<>|]/.test(rootFolder)) {
    throw new Error('ONEDRIVE_ROOT_FOLDER 必须是有效的单级目录名');
  }

  for (const [key, fallback] of [
    ['BACKUP_AUTO_AFTER_HOURS', 24],
    ['BACKUP_OPERATION_THRESHOLD', 50],
  ] as const) {
    const value = Number(raw[key] ?? fallback);
    if (!Number.isInteger(value) || value < 1 || value > 100_000) {
      throw new Error(`${key} 必须是 1 到 100000 之间的整数`);
    }
  }
  const recoveryKey = String(raw.BOOTSTRAP_RECOVERY_KEY ?? '');
  if (recoveryKey && recoveryKey.length < 16) {
    throw new Error('BOOTSTRAP_RECOVERY_KEY 至少需要 16 个字符');
  }

  if (raw.NODE_ENV === 'production') {
    for (const key of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET']) {
      if (String(raw[key] ?? '').length < 32) {
        throw new Error(`${key} 在生产环境中必须至少 32 个字符`);
      }
    }
  }

  return raw;
}
