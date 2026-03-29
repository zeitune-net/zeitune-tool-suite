import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@shared/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center rounded-md px-1.5 py-[1px] text-[10px] font-medium border transition-colors',
  {
    variants: {
      variant: {
        default: 'bg-primary/10 text-primary border-primary/30',
        secondary: 'bg-muted text-muted-foreground border-border',
        destructive: 'bg-destructive/10 text-destructive border-destructive/25',
        success: 'bg-primary/12 text-primary border-primary/30',
        warning: 'bg-warning/10 text-warning border-warning/25',
        info: 'bg-info/10 text-info border-info/25',
        purple: 'bg-purple/10 text-purple border-purple/25',
        muted: 'bg-muted text-muted-foreground border-border'
      }
    },
    defaultVariants: {
      variant: 'default'
    }
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
