import { createPortal } from 'preact/compat'

interface Props {
  message: string
  confirmLabel?: string
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({ message, confirmLabel = 'Delete', onConfirm, onCancel }: Props) {
  return createPortal(
    <div
      class="fixed inset-0 bg-black/65 flex items-center justify-center z-[100] backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel() }}
    >
      <div class="bg-bg-secondary border border-border-light rounded-lg p-6 w-full max-w-[400px] max-h-[calc(100vh-64px)] overflow-y-auto shadow-lg flex flex-col gap-[18px]">
        <div class="flex items-center justify-between">
          <span class="font-display text-[15px] font-semibold text-text-primary tracking-[0.05em]">Confirm</span>
          <button type="button" class="text-text-muted text-[18px] px-[6px] py-[2px] rounded transition-colors duration-150 hover:text-text-primary hover:bg-bg-hover" onClick={onCancel}>✕</button>
        </div>
        <p class="text-[13px] text-text-secondary leading-relaxed">{message}</p>
        <div class="flex justify-end gap-2 pt-1">
          <button type="button" class="px-4 py-2 text-[13px] text-text-secondary border border-border rounded bg-bg-tertiary transition-all duration-150 hover:border-accent hover:text-text-primary" onClick={onCancel}>Cancel</button>
          <button type="button" class="px-5 py-2 text-[13px] font-medium text-text-on-accent bg-error rounded transition-colors duration-150 hover:opacity-85" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
