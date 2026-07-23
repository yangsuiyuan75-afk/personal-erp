import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Boxes, DatabaseBackup, LockKeyhole, ShieldCheck, Upload } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { bootstrapRestore, getBootstrapRecoveryStatus } from '@/features/backup/api';
import { apiErrorMessage } from '@/lib/api-error';
import { useBootstrapAdmin, useLogin } from './use-auth';

const schema = z.object({
  username: z.string().min(3, '用户名至少 3 个字符').max(64),
  password: z.string().min(12, '密码至少 12 个字符'),
});

type FormData = z.infer<typeof schema>;

export function AuthPage({ mode }: { mode: 'bootstrap' | 'login' }) {
  const bootstrap = useBootstrapAdmin();
  const login = useLogin();
  const mutation = mode === 'bootstrap' ? bootstrap : login;
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [backupFile, setBackupFile] = useState<File>();
  const [recoveryKey, setRecoveryKey] = useState('');
  const [confirmPhrase, setConfirmPhrase] = useState('');
  const recoveryStatus = useQuery({
    queryKey: ['bootstrap-recovery', 'status'],
    queryFn: getBootstrapRecoveryStatus,
    enabled: mode === 'bootstrap' && restoreOpen,
    retry: false,
  });
  const restore = useMutation({
    mutationFn: bootstrapRestore,
    onSuccess: () => window.location.reload(),
  });
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      username: mode === 'login' ? import.meta.env.VITE_DEFAULT_LOGIN_USERNAME || 'admin' : 'admin',
      password: mode === 'login' ? import.meta.env.VITE_DEFAULT_LOGIN_PASSWORD || '' : '',
    },
  });

  return (
    <main className="auth-page">
      <section className="auth-brand-panel">
        <div className="auth-logo">
          <Boxes aria-hidden />
        </div>
        <span>PERSONAL ERP</span>
        <h1>把库存、渠道、质量与资金收进一个可靠的本地工作台。</h1>
        <p>数据保存在你的 PostgreSQL；业务文件通过你授权的 OneDrive 管理。</p>
        <div className="auth-assurance">
          <ShieldCheck aria-hidden />
          <span>单管理员 · Argon2id · HttpOnly 刷新令牌</span>
        </div>
      </section>
      <section className="auth-form-panel">
        <form className="auth-form" onSubmit={handleSubmit((values) => mutation.mutate(values))}>
          <div className="auth-form-icon">
            <LockKeyhole aria-hidden />
          </div>
          <h2>{mode === 'bootstrap' ? '创建本地管理员' : '欢迎回来'}</h2>
          <p>
            {mode === 'bootstrap'
              ? '此工作区只允许创建一个管理员账户。'
              : '登录后继续管理你的业务。'}
          </p>
          <Field label="用户名" error={errors.username?.message}>
            <Input {...register('username')} />
          </Field>
          <Field label="密码" error={errors.password?.message}>
            <Input type="password" {...register('password')} />
          </Field>
          {mutation.error ? (
            <div className="form-alert">{apiErrorMessage(mutation.error)}</div>
          ) : null}
          <Button className="auth-submit" disabled={mutation.isPending} type="submit">
            {mutation.isPending ? '正在处理…' : mode === 'bootstrap' ? '创建并进入系统' : '登录'}
          </Button>
          {mode === 'bootstrap' ? (
            <div className="bootstrap-recovery-entry">
              <button
                aria-expanded={restoreOpen}
                onClick={() => setRestoreOpen((current) => !current)}
                type="button"
              >
                <DatabaseBackup size={16} />
                已有数据库备份？从恢复点启动
              </button>
              {restoreOpen ? (
                <section className="bootstrap-recovery-panel">
                  <div className="bootstrap-recovery-state">
                    <ShieldCheck size={16} />
                    <span>
                      <strong>
                        {recoveryStatus.data?.recoveryConfigured
                          ? 'Bootstrap 恢复已就绪'
                          : '需要配置恢复密钥'}
                      </strong>
                      {recoveryStatus.data?.recoveryConfigured
                        ? '上传 custom format .dump 后会执行迁移与健康检查。'
                        : '在 .env 设置至少 16 字符的 BOOTSTRAP_RECOVERY_KEY。'}
                    </span>
                  </div>
                  <Field label="恢复密钥">
                    <Input
                      onChange={(event) => setRecoveryKey(event.target.value)}
                      type="password"
                      value={recoveryKey}
                    />
                  </Field>
                  <label className="bootstrap-file-picker">
                    <Upload size={15} />
                    <span>{backupFile?.name ?? '选择 .dump 备份文件'}</span>
                    <input
                      accept=".dump,application/octet-stream"
                      onChange={(event) => setBackupFile(event.target.files?.[0])}
                      type="file"
                    />
                  </label>
                  <Field label="输入确认短语：BOOTSTRAP RESTORE">
                    <Input
                      onChange={(event) => setConfirmPhrase(event.target.value)}
                      value={confirmPhrase}
                    />
                  </Field>
                  {restore.error ? (
                    <div className="form-alert">{apiErrorMessage(restore.error)}</div>
                  ) : null}
                  <Button
                    disabled={
                      restore.isPending ||
                      !backupFile ||
                      !recoveryKey ||
                      confirmPhrase !== 'BOOTSTRAP RESTORE'
                    }
                    onClick={() =>
                      backupFile && restore.mutate({ file: backupFile, recoveryKey, confirmPhrase })
                    }
                    type="button"
                    variant="secondary"
                  >
                    <DatabaseBackup size={16} />
                    {restore.isPending ? '正在恢复并检查…' : '恢复此备份'}
                  </Button>
                </section>
              ) : null}
            </div>
          ) : null}
        </form>
      </section>
    </main>
  );
}
