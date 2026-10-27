import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { SERVER_PERMISSIONS, type ServerDetail } from '@mornihosting/shared';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/misc';
import { api } from '@/lib/api';

/** Deleting a server. Files are kept in an archive folder unless the owner ticks the box. */
export function DangerZone({ server }: { server: ServerDetail }): ReactElement | null {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [deleteFiles, setDeleteFiles] = useState(false);
  const remove = useMutation({
    mutationFn: () =>
      api(`/api/servers/${server.id}?deleteFiles=${String(deleteFiles)}`, { method: 'DELETE' }),
    onSuccess: async () => {
      toast.success(t('settings.danger.deleted', { name: server.name }));
      queryClient.removeQueries({ queryKey: ['server', server.id] });
      await queryClient.invalidateQueries({ queryKey: ['servers'] });
      await navigate('/');
    },
  });
  if (server.permissions.length !== SERVER_PERMISSIONS.length) return null;
  return (
    <Card className="border-destructive/40 p-5 sm:p-6">
      <div className="flex flex-wrap items-center gap-4">
        <div className="min-w-[220px] flex-1">
          <CardTitle className="text-destructive">{t('common.dangerZone')}</CardTitle>
          <CardDescription className="mt-1">{t('settings.danger.text')}</CardDescription>
        </div>
        <Button variant="destructive" onClick={() => setOpen(true)}>
          <Trash2 />
          {t('settings.danger.delete')}
        </Button>
      </div>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={t('settings.danger.confirmTitle', { name: server.name })}
        description={t(deleteFiles ? 'settings.danger.confirmFiles' : 'settings.danger.confirmArchive')}
        confirmLabel={t('settings.danger.delete')}
        confirmWord={server.name}
        onConfirm={async () => {
          await remove.mutateAsync();
        }}
      >
        <label className="flex items-start gap-3 rounded-[12px] border border-border p-3 text-sm">
          <Checkbox
            checked={deleteFiles}
            onCheckedChange={(on) => setDeleteFiles(on === true)}
            className="mt-0.5"
          />
          <span>
            <b className="block font-semibold">{t('settings.danger.deleteFiles')}</b>
            <span className="text-muted-foreground">{t('settings.danger.deleteFilesHint')}</span>
          </span>
        </label>
      </ConfirmDialog>
    </Card>
  );
}
