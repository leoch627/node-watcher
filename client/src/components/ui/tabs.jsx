import * as TabsPrimitive from '@radix-ui/react-tabs';
import { cn } from '@/lib/utils';

export const Tabs = TabsPrimitive.Root;
export function TabsList({ className, ...props }) { return <TabsPrimitive.List className={cn('inline-flex h-9 items-center rounded-md bg-muted p-1 text-muted-foreground', className)} {...props} />; }
export function TabsTrigger({ className, ...props }) { return <TabsPrimitive.Trigger className={cn('inline-flex h-7 items-center justify-center rounded-sm px-3 text-sm font-medium outline-none data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm', className)} {...props} />; }
export function TabsContent({ className, ...props }) { return <TabsPrimitive.Content className={cn('mt-5 outline-none', className)} {...props} />; }
