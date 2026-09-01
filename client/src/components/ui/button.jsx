import { Slot } from '@radix-ui/react-slot';
import { cva } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex h-9 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md border text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4',
  {
    variants: {
      variant: {
        default: 'border-primary bg-primary px-3 text-primary-foreground hover:bg-primary/90',
        outline: 'border-border bg-background px-3 hover:bg-accent hover:text-accent-foreground',
        ghost: 'border-transparent px-2 hover:bg-accent hover:text-accent-foreground',
        destructive: 'border-destructive bg-destructive px-3 text-destructive-foreground hover:bg-destructive/90'
      },
      size: { default: '', icon: 'w-9 px-0' }
    },
    defaultVariants: { variant: 'default', size: 'default' }
  }
);

export function Button({ className, variant, size, asChild = false, ...props }) {
  const Comp = asChild ? Slot : 'button';
  return <Comp className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}
