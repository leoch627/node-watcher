import { cn } from '@/lib/utils';

export function Input({ className, ...props }) {
  return <input className={cn('flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring disabled:opacity-50', className)} {...props} />;
}

export function Textarea({ className, ...props }) {
  return <textarea className={cn('flex min-h-36 w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring disabled:opacity-50', className)} {...props} />;
}
