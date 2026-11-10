import { cn } from '@/lib/utils'

/** Chip visual de tecla (ej. <Kbd>F2</Kbd>) para documentar atajos en la UI. */
export function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        'inline-flex items-center justify-center min-w-[22px] h-[22px] px-1.5 rounded-md border border-brand-border dark:border-white/15',
        'bg-white dark:bg-white/10 text-[11px] font-semibold text-brand-black dark:text-white shadow-sm',
        'font-mono leading-none',
        className
      )}
    >
      {children}
    </kbd>
  )
}
