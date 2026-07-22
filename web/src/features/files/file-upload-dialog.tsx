import { Dialog } from '@base-ui/react/dialog';
import { FileUp, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useToast } from '@/components/feedback/toast-provider';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { apiErrorMessage } from '@/lib/api-error';
import { useFileMutations } from './use-files';

export function FileUploadDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const notify = useToast();
  const mutations = useFileMutations();
  const [file, setFile] = useState<File>();
  const [logicalPath, setLogicalPath] = useState('Finance/General');
  const [module, setModule] = useState('');
  const [entityType, setEntityType] = useState('');
  const [entityId, setEntityId] = useState('');
  const [label, setLabel] = useState('');

  useEffect(() => {
    if (open) return;
    setFile(undefined);
    setLogicalPath('Finance/General');
    setModule('');
    setEntityType('');
    setEntityId('');
    setLabel('');
  }, [open]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!file) {
      notify('请选择需要上传的文件', 'error');
      return;
    }
    const associationFields = [module, entityType, entityId].filter(Boolean).length;
    if (associationFields > 0 && associationFields < 3) {
      notify('业务关联需要同时填写模块、实体类型和实体 ID', 'error');
      return;
    }
    try {
      await mutations.upload.mutateAsync({
        file,
        logicalPath,
        module: module || undefined,
        entityType: entityType || undefined,
        entityId: entityId || undefined,
        label: label || undefined,
      });
      notify('文件已上传并写入文件资产', 'success');
      onOpenChange(false);
    } catch (error) {
      notify(apiErrorMessage(error), 'error');
    }
  };

  return (
    <Dialog.Root onOpenChange={onOpenChange} open={open}>
      <Dialog.Portal>
        <Dialog.Backdrop className="dialog-backdrop" />
        <Dialog.Viewport className="dialog-viewport">
          <Dialog.Popup className="dialog-popup file-upload-dialog">
            <header className="dialog-header">
              <div>
                <Dialog.Title>上传文件资产</Dialog.Title>
                <Dialog.Description>
                  文件内容进入当前 Storage Provider，数据库仅保存元数据与业务关联。
                </Dialog.Description>
              </div>
              <Dialog.Close aria-label="关闭" className="icon-button">
                <X size={18} />
              </Dialog.Close>
            </header>
            <form className="dialog-form" onSubmit={submit}>
              <label className="file-dropzone">
                <FileUp size={25} />
                <strong>{file?.name ?? '选择文件'}</strong>
                <span>
                  {file
                    ? `${(file.size / 1024).toLocaleString('zh-CN', { maximumFractionDigits: 1 })} KB`
                    : '拒绝 SVG 与可执行文件；大文件由 OneDrive Upload Session 分片上传'}
                </span>
                <input onChange={(event) => setFile(event.target.files?.[0])} type="file" />
              </label>
              <div className="form-grid">
                <Field label="逻辑目录">
                  <Input
                    onChange={(event) => setLogicalPath(event.target.value)}
                    placeholder="Purchase/PO-202607-001"
                    required
                    value={logicalPath}
                  />
                </Field>
                <Field label="附件标签">
                  <Input
                    onChange={(event) => setLabel(event.target.value)}
                    placeholder="合同 / 凭证 / 质检照片"
                    value={label}
                  />
                </Field>
                <Field label="业务模块（可选）">
                  <Input
                    onChange={(event) => setModule(event.target.value.toUpperCase())}
                    placeholder="PURCHASE"
                    value={module}
                  />
                </Field>
                <Field label="实体类型（可选）">
                  <Input
                    onChange={(event) => setEntityType(event.target.value)}
                    placeholder="PurchaseOrder"
                    value={entityType}
                  />
                </Field>
                <Field label="实体 ID（可选）">
                  <Input
                    onChange={(event) => setEntityId(event.target.value)}
                    placeholder="业务记录 ID"
                    value={entityId}
                  />
                </Field>
              </div>
              <footer className="dialog-footer">
                <Dialog.Close className="button button-ghost">取消</Dialog.Close>
                <Button disabled={mutations.upload.isPending} type="submit">
                  {mutations.upload.isPending ? '正在安全上传…' : '上传文件'}
                </Button>
              </footer>
            </form>
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
