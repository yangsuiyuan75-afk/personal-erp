import { AlertDialog } from '@base-ui/react/alert-dialog';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function DeactivateDialog({
  action,
  name,
  open,
  pending,
  onOpenChange,
  onConfirm,
}: {
  action: 'activate' | 'deactivate';
  name: string;
  open: boolean;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => Promise<void>;
}) {
  const activating = action === 'activate';

  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className="dialog-backdrop" />
        <AlertDialog.Viewport className="dialog-viewport">
          <AlertDialog.Popup className="confirm-popup">
            <div className={`confirm-icon${activating ? ' confirm-icon-activate' : ''}`}>
              {activating ? <RotateCcw aria-hidden /> : <AlertTriangle aria-hidden />}
            </div>
            <AlertDialog.Title>
              {activating ? '启用' : '停用'}“{name}”？
            </AlertDialog.Title>
            <AlertDialog.Description>
              {activating
                ? '启用后，新单据可以再次选择此资料。'
                : '历史业务仍会保留，但新单据不能再选择此资料。'}
            </AlertDialog.Description>
            <footer className="dialog-footer">
              <AlertDialog.Close className="button button-ghost">取消</AlertDialog.Close>
              <Button
                disabled={pending}
                onClick={() => void onConfirm()}
                variant={activating ? 'primary' : 'danger'}
              >
                {pending
                  ? `正在${activating ? '启用' : '停用'}…`
                  : `确认${activating ? '启用' : '停用'}`}
              </Button>
            </footer>
          </AlertDialog.Popup>
        </AlertDialog.Viewport>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
