import * as Dialog from '@radix-ui/react-dialog';

export default function DeckScreenshot({ url }: { url: string }) {
  return (
    <Dialog.Root>
      <Dialog.Trigger type="button" className="flex w-full flex-col items-center gap-1 rounded-lg bg-gray-500/10 p-2 text-sm underline">
        <img src={url} alt="Исходный скриншот колоды" className="max-h-72 max-w-full rounded object-contain" />
        Увеличить скриншот
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/70" />
        <Dialog.Content aria-describedby={undefined} className="fixed inset-3 z-[60] overflow-auto rounded-lg bg-white p-3 dark:bg-gray-800 sm:inset-8">
          <div className="mb-3 flex items-center justify-between gap-2">
            <Dialog.Title className="font-semibold">Исходный скриншот</Dialog.Title>
            <Dialog.Close type="button" className="rounded border px-3 py-1">Закрыть</Dialog.Close>
          </div>
          <img src={url} alt="Увеличенный скриншот колоды" className="mx-auto h-auto max-w-full" />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
