import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@shared/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-[12.5px] font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40 active:scale-[0.97]',
  {
    variants: {
      variant: {
        default: 'bg-primary text-white hover:bg-primary/90',
        destructive: 'bg-destructive/15 text-destructive border border-destructive/25 hover:bg-destructive/25',
        outline: 'border border-border bg-transparent hover:bg-muted hover:text-foreground hover:border-border-hi',
        secondary: 'bg-secondary text-secondary-foreground border border-border hover:bg-muted',
        ghost: 'text-muted-foreground hover:bg-muted hover:text-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
        green: 'bg-primary/12 text-primary border border-primary/25 hover:bg-primary/20',
        warning: 'bg-warning/10 text-warning border border-warning/25 hover:bg-warning/20',
        info: 'bg-info/10 text-info border border-info/25 hover:bg-info/20'
      },
      size: {
        default: 'h-8 px-3.5 py-1.5',
        sm: 'h-7 rounded-md px-2.5 text-[11.5px]',
        lg: 'h-9 rounded-lg px-5',
        icon: 'h-8 w-8'
      }
    },
    defaultVariants: {
      variant: 'default',
      size: 'default'
    }
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = 'Button'

export { Button, buttonVariants }
