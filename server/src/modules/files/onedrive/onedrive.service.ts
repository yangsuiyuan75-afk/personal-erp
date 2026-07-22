import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import {
  InteractionRequiredAuthError,
  LogLevel,
  PublicClientApplication,
  type AuthenticationResult,
  type DeviceCodeRequest,
} from '@azure/msal-node';
import { PrismaService } from '../../../database/prisma.service';
import { OneDriveTokenCacheService } from './onedrive-token-cache.service';

const CONNECTION_SETTING_KEY = 'onedrive.connection';
const GRAPH_BASE_URL = 'https://graph.microsoft.com/v1.0';
const GRAPH_SCOPES = ['User.Read', 'Files.ReadWrite', 'offline_access'];

type OneDriveStatusCode =
  | 'CLIENT_ID_MISSING'
  | 'NOT_CONNECTED'
  | 'AUTHORIZING'
  | 'CONNECTED'
  | 'REAUTH_REQUIRED'
  | 'GRAPH_UNREACHABLE'
  | 'STORAGE_FULL';

const STATUS_LABELS: Record<OneDriveStatusCode, string> = {
  CLIENT_ID_MISSING: '未配置 Client ID',
  NOT_CONNECTED: '未连接',
  AUTHORIZING: '正在授权',
  CONNECTED: '已连接',
  REAUTH_REQUIRED: 'Token 需要重新授权',
  GRAPH_UNREACHABLE: 'Graph 不可达',
  STORAGE_FULL: 'OneDrive 空间不足',
};

interface DeviceCodeView {
  userCode: string;
  verificationUri: string;
  expiresAt: string;
  message: string;
}

interface DriveResponse {
  id: string;
  driveType: string;
  owner?: { user?: { displayName?: string; email?: string; id?: string } };
  quota?: { total?: number; used?: number; remaining?: number; state?: string };
}

interface DriveItemResponse {
  id: string;
  name: string;
  parentReference?: { id?: string; driveId?: string };
  size?: number;
  eTag?: string;
}

interface ConnectionMetadata {
  accountId: string;
  username: string;
  displayName?: string;
  driveId: string;
  driveType: string;
  rootItemId: string;
  rootFolder: string;
  connectedAt: string;
  quota?: DriveResponse['quota'];
}

interface AuthorizingState {
  status: 'AUTHORIZING';
  deviceCode?: DeviceCodeView;
}

export class OneDriveGraphError extends Error {
  constructor(
    readonly code: 'REAUTH_REQUIRED' | 'GRAPH_UNREACHABLE' | 'STORAGE_FULL' | 'GRAPH_ERROR',
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

@Injectable()
export class OneDriveService {
  private readonly clientId?: string;
  private readonly authority: string;
  private readonly rootFolder: string;
  private readonly client: PublicClientApplication | null;
  private authorizationState: AuthorizingState | null = null;
  private authorizationTask: Promise<void> | null = null;
  private cancelDeviceCode?: () => void;
  private lastRuntimeError: OneDriveGraphError['code'] | null = null;
  private readonly folderCache = new Map<string, DriveItemResponse>();

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
    private readonly tokenCache: OneDriveTokenCacheService,
  ) {
    this.clientId = config.get<string>('MICROSOFT_CLIENT_ID')?.trim() || undefined;
    this.authority =
      config.get<string>('MICROSOFT_AUTHORITY')?.trim() ||
      'https://login.microsoftonline.com/consumers';
    this.rootFolder = config.get<string>('ONEDRIVE_ROOT_FOLDER')?.trim() || 'ERP_STORAGE';
    this.client = this.clientId
      ? new PublicClientApplication({
          auth: { clientId: this.clientId, authority: this.authority },
          cache: { cachePlugin: this.tokenCache },
          system: {
            loggerOptions: {
              loggerCallback: () => undefined,
              piiLoggingEnabled: false,
              logLevel: LogLevel.Error,
            },
          },
        })
      : null;
  }

  async status(probe = true) {
    if (!this.clientId || !this.client) return this.statusView('CLIENT_ID_MISSING');
    if (this.authorizationState) {
      return { ...this.statusView('AUTHORIZING'), deviceCode: this.authorizationState.deviceCode };
    }

    let metadata: ConnectionMetadata | null = null;
    try {
      metadata = await this.connectionMetadata();
      const accounts = await this.client.getAllAccounts();
      if (!metadata && accounts.length === 0) return this.statusView('NOT_CONNECTED');
      if (!metadata || accounts.length === 0) return this.statusView('REAUTH_REQUIRED', metadata);
      if (!probe) return this.statusView('CONNECTED', metadata);

      const drive = await this.getDrive();
      const next = { ...metadata, quota: drive.quota };
      await this.saveConnection(next);
      if ((drive.quota?.remaining ?? 1) <= 0 || drive.quota?.state === 'exceeded') {
        return this.statusView('STORAGE_FULL', next);
      }
      this.lastRuntimeError = null;
      return this.statusView('CONNECTED', next);
    } catch (error) {
      const graphError = this.normalizeError(error);
      if (graphError.code === 'REAUTH_REQUIRED')
        return this.statusView('REAUTH_REQUIRED', metadata ?? undefined);
      if (graphError.code === 'STORAGE_FULL')
        return this.statusView('STORAGE_FULL', metadata ?? undefined);
      return this.statusView('GRAPH_UNREACHABLE', metadata ?? undefined);
    }
  }

  async startConnection(): Promise<DeviceCodeView> {
    if (!this.client) {
      throw new OneDriveGraphError('GRAPH_ERROR', '请先配置 MICROSOFT_CLIENT_ID', 422);
    }
    if (this.authorizationState?.deviceCode) return this.authorizationState.deviceCode;
    if (this.authorizationTask) {
      throw new OneDriveGraphError('GRAPH_ERROR', '设备授权请求正在启动', 409);
    }

    this.authorizationState = { status: 'AUTHORIZING' };
    let resolveCode!: (value: DeviceCodeView) => void;
    let rejectCode!: (reason: unknown) => void;
    const codeReady = new Promise<DeviceCodeView>((resolve, reject) => {
      resolveCode = resolve;
      rejectCode = reject;
    });
    let codeDelivered = false;

    const deviceRequest: DeviceCodeRequest = {
      scopes: GRAPH_SCOPES,
      cancel: false,
      deviceCodeCallback: (response) => {
        const view: DeviceCodeView = {
          userCode: response.userCode,
          verificationUri: response.verificationUri,
          expiresAt: new Date(Date.now() + response.expiresIn * 1000).toISOString(),
          message: response.message,
        };
        codeDelivered = true;
        this.authorizationState = { status: 'AUTHORIZING', deviceCode: view };
        resolveCode(view);
      },
    };
    this.cancelDeviceCode = () => {
      deviceRequest.cancel = true;
    };
    this.authorizationTask = this.client
      .acquireTokenByDeviceCode(deviceRequest)
      .then(async (result) => this.completeConnection(result))
      .catch((error: unknown) => {
        const normalized = this.normalizeError(error);
        this.lastRuntimeError = normalized.code;
        if (!codeDelivered) rejectCode(normalized);
      })
      .finally(() => {
        this.authorizationState = null;
        this.authorizationTask = null;
        this.cancelDeviceCode = undefined;
      });

    return Promise.race([
      codeReady,
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new OneDriveGraphError('GRAPH_UNREACHABLE', '无法获取设备授权码')),
          15_000,
        ),
      ),
    ]);
  }

  async disconnect(): Promise<void> {
    this.cancelDeviceCode?.();
    if (this.client) {
      const tokenCache = this.client.getTokenCache();
      const accounts = await tokenCache.getAllAccounts();
      for (const account of accounts) await tokenCache.removeAccount(account);
    }
    await this.tokenCache.clear();
    await this.prisma.systemSetting.deleteMany({ where: { key: CONNECTION_SETTING_KEY } });
    this.authorizationState = null;
    this.authorizationTask = null;
    this.lastRuntimeError = null;
    this.folderCache.clear();
  }

  async isConnected(): Promise<boolean> {
    const result = await this.status(false);
    return ['CONNECTED', 'GRAPH_UNREACHABLE', 'STORAGE_FULL'].includes(result.code);
  }

  reportRuntimeError(error: unknown): void {
    this.lastRuntimeError = this.normalizeError(error).code;
  }

  async ensureFolderPath(logicalPath: string): Promise<DriveItemResponse> {
    const metadata = await this.requireConnection();
    let parent: DriveItemResponse = {
      id: metadata.rootItemId,
      name: metadata.rootFolder,
      parentReference: { driveId: metadata.driveId },
    };
    let key = metadata.rootItemId;
    for (const segment of logicalPath.split('/').filter(Boolean)) {
      key = `${key}/${segment}`;
      const cached = this.folderCache.get(key);
      if (cached) {
        parent = cached;
        continue;
      }
      parent = await this.findOrCreateFolder(parent.id, segment);
      this.folderCache.set(key, parent);
    }
    return parent;
  }

  async graphJson<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await this.graphFetch(path, init);
    return (await response.json()) as T;
  }

  async graphBuffer(
    path: string,
    init: RequestInit = {},
  ): Promise<{ response: Response; data: Buffer }> {
    const response = await this.graphFetch(path, init);
    return { response, data: Buffer.from(await response.arrayBuffer()) };
  }

  async graphFetch(path: string, init: RequestInit = {}): Promise<Response> {
    const token = await this.accessToken();
    try {
      const response = await fetch(`${GRAPH_BASE_URL}${path}`, {
        ...init,
        headers: {
          accept: 'application/json',
          ...init.headers,
          authorization: `Bearer ${token}`,
        },
      });
      if (!response.ok) await this.throwGraphResponse(response);
      return response;
    } catch (error) {
      const normalized = this.normalizeError(error);
      this.lastRuntimeError = normalized.code;
      throw normalized;
    }
  }

  async accessToken(): Promise<string> {
    if (!this.client) throw new OneDriveGraphError('REAUTH_REQUIRED', 'OneDrive 未配置');
    try {
      const accounts = await this.client.getAllAccounts();
      if (!accounts[0]) throw new OneDriveGraphError('REAUTH_REQUIRED', 'OneDrive 未授权');
      const result = await this.client.acquireTokenSilent({
        account: accounts[0],
        scopes: GRAPH_SCOPES,
      });
      return result.accessToken;
    } catch (error) {
      if (error instanceof OneDriveGraphError) throw error;
      if (error instanceof InteractionRequiredAuthError) {
        throw new OneDriveGraphError('REAUTH_REQUIRED', 'Token 需要重新授权', 401);
      }
      throw this.normalizeError(error);
    }
  }

  private async completeConnection(result: AuthenticationResult | null): Promise<void> {
    if (!result?.account) throw new OneDriveGraphError('REAUTH_REQUIRED', '未获得授权账户');
    const drive = await this.getDrive();
    if (drive.driveType !== 'personal') {
      throw new OneDriveGraphError('GRAPH_ERROR', '仅支持 OneDrive Personal', 422);
    }
    const root = await this.findOrCreateRootFolder();
    await this.saveConnection({
      accountId: result.account.homeAccountId,
      username: result.account.username,
      displayName: drive.owner?.user?.displayName ?? result.account.name,
      driveId: drive.id,
      driveType: drive.driveType,
      rootItemId: root.id,
      rootFolder: root.name,
      connectedAt: new Date().toISOString(),
      quota: drive.quota,
    });
    this.lastRuntimeError = null;
  }

  private async getDrive(): Promise<DriveResponse> {
    return this.graphJson<DriveResponse>('/me/drive?$select=id,driveType,owner,quota');
  }

  private async findOrCreateRootFolder(): Promise<DriveItemResponse> {
    try {
      return await this.graphJson<DriveItemResponse>(
        `/me/drive/root:/${encodeURIComponent(this.rootFolder)}`,
      );
    } catch (error) {
      const normalized = this.normalizeError(error);
      if (normalized.status !== 404) throw normalized;
      return this.graphJson<DriveItemResponse>('/me/drive/root/children', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: this.rootFolder,
          folder: {},
          '@microsoft.graph.conflictBehavior': 'rename',
        }),
      });
    }
  }

  private async findOrCreateFolder(parentId: string, name: string): Promise<DriveItemResponse> {
    try {
      return await this.graphJson<DriveItemResponse>(
        `/me/drive/items/${encodeURIComponent(parentId)}:/${encodeURIComponent(name)}`,
      );
    } catch (error) {
      const normalized = this.normalizeError(error);
      if (normalized.status !== 404) throw normalized;
      return this.graphJson<DriveItemResponse>(
        `/me/drive/items/${encodeURIComponent(parentId)}/children`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            name,
            folder: {},
            '@microsoft.graph.conflictBehavior': 'rename',
          }),
        },
      );
    }
  }

  private async requireConnection(): Promise<ConnectionMetadata> {
    const metadata = await this.connectionMetadata();
    if (!metadata) throw new OneDriveGraphError('REAUTH_REQUIRED', 'OneDrive 未连接', 401);
    return metadata;
  }

  private async connectionMetadata(): Promise<ConnectionMetadata | null> {
    const setting = await this.prisma.systemSetting.findUnique({
      where: { key: CONNECTION_SETTING_KEY },
    });
    return setting ? (setting.value as unknown as ConnectionMetadata) : null;
  }

  private async saveConnection(metadata: ConnectionMetadata): Promise<void> {
    const value = metadata as unknown as Prisma.InputJsonValue;
    await this.prisma.systemSetting.upsert({
      where: { key: CONNECTION_SETTING_KEY },
      create: { key: CONNECTION_SETTING_KEY, value },
      update: { value },
    });
  }

  private statusView(code: OneDriveStatusCode, metadata?: ConnectionMetadata | null) {
    const runtimeCode =
      code === 'CONNECTED' && this.lastRuntimeError === 'STORAGE_FULL'
        ? 'STORAGE_FULL'
        : code === 'CONNECTED' && this.lastRuntimeError === 'GRAPH_UNREACHABLE'
          ? 'GRAPH_UNREACHABLE'
          : code;
    return {
      code: runtimeCode,
      label: STATUS_LABELS[runtimeCode],
      configured: Boolean(this.clientId),
      externalConfigurationStatus: this.clientId
        ? 'CONFIGURED'
        : 'WAITING_FOR_EXTERNAL_CONFIGURATION',
      mockProviderAvailable: true,
      authority: this.authority,
      scopes: GRAPH_SCOPES,
      account: metadata
        ? { username: metadata.username, displayName: metadata.displayName }
        : undefined,
      drive: metadata
        ? {
            id: metadata.driveId,
            type: metadata.driveType,
            rootFolder: metadata.rootFolder,
            quota: metadata.quota,
            connectedAt: metadata.connectedAt,
          }
        : undefined,
    };
  }

  private async throwGraphResponse(response: Response): Promise<never> {
    let payload: { error?: { code?: string; message?: string } } = {};
    try {
      payload = (await response.json()) as typeof payload;
    } catch {
      // Graph can return an empty response body for gateway errors.
    }
    const graphCode = payload.error?.code ?? '';
    const message = payload.error?.message || `Microsoft Graph 请求失败 (${response.status})`;
    if (response.status === 401 || response.status === 403) {
      throw new OneDriveGraphError('REAUTH_REQUIRED', 'Token 需要重新授权', response.status);
    }
    if (/quota|space|storage/i.test(`${graphCode} ${message}`)) {
      throw new OneDriveGraphError('STORAGE_FULL', 'OneDrive 空间不足', response.status);
    }
    if (response.status >= 500 || response.status === 429) {
      throw new OneDriveGraphError('GRAPH_UNREACHABLE', 'Graph 不可达', response.status);
    }
    throw new OneDriveGraphError('GRAPH_ERROR', message, response.status);
  }

  private normalizeError(error: unknown): OneDriveGraphError {
    if (error instanceof OneDriveGraphError) return error;
    if (error instanceof InteractionRequiredAuthError) {
      return new OneDriveGraphError('REAUTH_REQUIRED', 'Token 需要重新授权', 401);
    }
    const message = error instanceof Error ? error.message : 'Microsoft Graph 请求失败';
    if (/interaction_required|invalid_grant|token_cache/i.test(message)) {
      return new OneDriveGraphError('REAUTH_REQUIRED', 'Token 需要重新授权', 401);
    }
    return new OneDriveGraphError('GRAPH_UNREACHABLE', 'Graph 不可达');
  }
}

export { CONNECTION_SETTING_KEY, GRAPH_SCOPES };
