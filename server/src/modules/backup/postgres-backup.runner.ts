import { createReadStream, createWriteStream } from 'node:fs';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface DatabaseTarget {
  host: string;
  port: string;
  username: string;
  password: string;
  database: string;
}

interface CommandResult {
  stdout: Buffer;
  stderr: string;
}

@Injectable()
export class PostgresBackupRunner {
  private readonly target: DatabaseTarget;
  private readonly containerName: string;
  private readonly dumpExecutable?: string;
  private readonly restoreExecutable?: string;

  constructor(private readonly config: ConfigService) {
    this.target = this.parseDatabaseUrl(config.getOrThrow<string>('DATABASE_URL'));
    const testDatabase = this.target.port === '5433';
    const containerKey = testDatabase ? 'POSTGRES_TEST_CONTAINER_NAME' : 'POSTGRES_CONTAINER_NAME';
    const defaultContainer = testDatabase ? 'personal-erp-postgres-test' : 'personal-erp-postgres';
    this.containerName = config.get<string>(containerKey)?.trim() || defaultContainer;
    this.dumpExecutable = config.get<string>('PG_DUMP_PATH')?.trim() || undefined;
    this.restoreExecutable = config.get<string>('PG_RESTORE_PATH')?.trim() || undefined;
  }

  async dump(outputPath: string): Promise<void> {
    const direct = Boolean(this.dumpExecutable);
    const executable = this.dumpExecutable ?? 'docker';
    const args = direct
      ? [...this.connectionArgs(), '-Fc', '--no-owner', '--no-acl']
      : [
          'exec',
          this.containerName,
          'pg_dump',
          '-U',
          this.target.username,
          '-d',
          this.target.database,
          '-Fc',
          '--no-owner',
          '--no-acl',
        ];
    await this.run(executable, args, { outputPath, direct });
  }

  async verify(filePath: string): Promise<{ catalogEntries: number }> {
    const direct = Boolean(this.restoreExecutable);
    const executable = this.restoreExecutable ?? 'docker';
    const args = direct
      ? ['--list', filePath]
      : ['exec', '-i', this.containerName, 'pg_restore', '--list'];
    const result = await this.run(executable, args, {
      inputPath: direct ? undefined : filePath,
      direct,
    });
    const catalog = result.stdout.toString('utf8');
    const entries = catalog.split(/\r?\n/).filter((line) => line.trim() && !line.startsWith(';'));
    if (!entries.some((line) => /\bTABLE(?: DATA)?\b/.test(line))) {
      throw new InternalServerErrorException({
        code: 'BACKUP_CATALOG_INVALID',
        message: '备份目录不包含业务表，文件可能已损坏',
      });
    }
    return { catalogEntries: entries.length };
  }

  async restore(filePath: string): Promise<void> {
    const restoreArgs = [
      '-U',
      this.target.username,
      '-d',
      this.target.database,
      '--clean',
      '--if-exists',
      '--no-owner',
      '--no-acl',
      '--exit-on-error',
      '--single-transaction',
    ];
    const direct = Boolean(this.restoreExecutable);
    const executable = this.restoreExecutable ?? 'docker';
    const args = direct
      ? [
          ...this.connectionArgs(),
          '--clean',
          '--if-exists',
          '--no-owner',
          '--no-acl',
          '--exit-on-error',
          '--single-transaction',
          filePath,
        ]
      : ['exec', '-i', this.containerName, 'pg_restore', ...restoreArgs];
    await this.run(executable, args, { inputPath: direct ? undefined : filePath, direct });
  }

  async migrate(): Promise<void> {
    const serverRoot = resolve(__dirname, '../../..');
    await this.run(
      'pnpm',
      [
        'exec',
        'prisma',
        'migrate',
        'deploy',
        '--schema',
        resolve(serverRoot, 'prisma/schema.prisma'),
      ],
      { cwd: serverRoot, direct: true, shell: process.platform === 'win32' },
    );
  }

  private connectionArgs(): string[] {
    return [
      '-h',
      this.target.host,
      '-p',
      this.target.port,
      '-U',
      this.target.username,
      '-d',
      this.target.database,
    ];
  }

  private run(
    executable: string,
    args: string[],
    options: {
      inputPath?: string;
      outputPath?: string;
      cwd?: string;
      direct: boolean;
      shell?: boolean;
    },
  ): Promise<CommandResult> {
    return new Promise((resolvePromise, reject) => {
      const child = spawn(executable, args, {
        cwd: options.cwd,
        env: options.direct ? { ...process.env, PGPASSWORD: this.target.password } : process.env,
        windowsHide: true,
        shell: options.shell,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      const stdout: Buffer[] = [];
      const stderr: Buffer[] = [];
      let outputError: Error | undefined;
      let outputDone: Promise<void> = Promise.resolve();

      if (options.outputPath) {
        const output = createWriteStream(options.outputPath, { flags: 'wx' });
        outputDone = new Promise((done) => {
          output.on('finish', done);
          output.on('error', (error) => {
            outputError = error;
            child.kill();
            done();
          });
        });
        child.stdout.pipe(output);
      } else {
        child.stdout.on('data', (chunk: Buffer) => {
          if (stdout.reduce((total, item) => total + item.length, 0) < 8 * 1024 * 1024) {
            stdout.push(Buffer.from(chunk));
          }
        });
      }

      if (options.inputPath) {
        const input = createReadStream(options.inputPath);
        input.on('error', (error) => {
          outputError = error;
          child.kill();
        });
        input.pipe(child.stdin);
      } else {
        child.stdin.end();
      }
      child.stderr.on('data', (chunk: Buffer) => {
        if (stderr.reduce((total, item) => total + item.length, 0) < 256 * 1024) {
          stderr.push(Buffer.from(chunk));
        }
      });
      child.on('error', reject);
      child.on('close', async (code) => {
        await outputDone;
        const stderrText = Buffer.concat(stderr).toString('utf8').trim();
        if (outputError) return reject(outputError);
        if (code !== 0) {
          return reject(
            new InternalServerErrorException({
              code: 'POSTGRES_TOOL_FAILED',
              message: stderrText || `PostgreSQL 工具退出码 ${code}`,
            }),
          );
        }
        resolvePromise({ stdout: Buffer.concat(stdout), stderr: stderrText });
      });
    });
  }

  private parseDatabaseUrl(value: string): DatabaseTarget {
    const url = new URL(value);
    if (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') {
      throw new Error('DATABASE_URL 必须使用 PostgreSQL 协议');
    }
    const database = decodeURIComponent(url.pathname.replace(/^\//, ''));
    if (!database) throw new Error('DATABASE_URL 缺少数据库名');
    return {
      host: url.hostname,
      port: url.port || '5432',
      username: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database,
    };
  }
}
