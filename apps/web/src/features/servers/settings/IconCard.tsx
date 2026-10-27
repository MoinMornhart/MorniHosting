import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ImageUp, Trash2 } from 'lucide-react';
import { useRef, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { ServerDetail } from '@mornihosting/shared';
import { refreshServerIcon, ServerIcon } from '@/components/server-visuals';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { api, upload } from '@/lib/api';

const ICON_SIZE = 64;

/** Scales any picture to the 64×64 PNG Minecraft wants, cropped to a square from the middle. */
async function toServerIcon(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = new OffscreenCanvas(ICON_SIZE, ICON_SIZE);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('canvas');
  context.imageSmoothingQuality = 'high';
  context.drawImage(
    bitmap,
    (bitmap.width - side) / 2, // eslint-disable-line ts-patterns/no-magic-numbers -- centre the square crop
    (bitmap.height - side) / 2, // eslint-disable-line ts-patterns/no-magic-numbers -- centre the square crop
    side,
    side,
    0,
    0,
    ICON_SIZE,
    ICON_SIZE,
  );
  bitmap.close();
  return canvas.convertToBlob({ type: 'image/png' });
}

export function IconCard({ server }: { server: ServerDetail }): ReactElement {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const refresh = async (): Promise<void> => {
    await queryClient.invalidateQueries({ queryKey: ['server', server.id] });
    await queryClient.invalidateQueries({ queryKey: ['servers'] });
  };
  const save = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append('file', await toServerIcon(file), 'server-icon.png');
      return upload(`/api/servers/${server.id}/icon`, form);
    },
    onSuccess: async () => {
      toast.success(t('settings.icon.saved'));
      refreshServerIcon(server.id);
      await refresh();
    },
    onSettled: () => {
      if (inputRef.current) inputRef.current.value = '';
    },
  });
  const remove = useMutation({
    mutationFn: () => api(`/api/servers/${server.id}/icon`, { method: 'DELETE' }),
    onSuccess: refresh,
  });
  return (
    <Card className="p-5 sm:p-6">
      <CardHeader className="mb-1">
        <CardTitle>{t('settings.icon.title')}</CardTitle>
      </CardHeader>
      <CardDescription className="mb-4">{t('settings.icon.text')}</CardDescription>
      <div className="flex flex-wrap items-center gap-4">
        <ServerIcon
          id={server.id}
          software={server.software}
          hasIcon={server.hasIcon}
          className="size-16 rounded-[12px]"
        />
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" disabled={save.isPending} onClick={() => inputRef.current?.click()}>
            <ImageUp />
            {t('settings.icon.choose')}
          </Button>
          {server.hasIcon ? (
            <Button variant="ghost" disabled={remove.isPending} onClick={() => remove.mutate()}>
              <Trash2 />
              {t('settings.icon.remove')}
            </Button>
          ) : null}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) save.mutate(file);
          }}
        />
      </div>
    </Card>
  );
}
