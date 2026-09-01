import { cn } from '@/lib/utils';

export function Badge({ className, variant = 'secondary', ...props }) {
  const variants = {
    secondary: 'bg-secondary text-secondary-foreground',
    success: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
    danger: 'bg-red-50 text-red-700 ring-red-600/20',
    warning: 'bg-amber-50 text-amber-800 ring-amber-600/20',
    outline: 'bg-background text-foreground ring-border'
  };
  return <span className={cn('inline-flex h-6 items-center rounded-md px-2 text-xs font-medium ring-1 ring-inset', variants[variant], className)} {...props} />;
}
