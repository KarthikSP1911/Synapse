import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-md border border-transparent text-sm font-medium whitespace-nowrap transition-[background-color,color,border-color,transform] duration-150 outline-none select-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:translate-y-px disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/85",
        outline: "border-border bg-background hover:bg-accent hover:border-input",
        secondary: "bg-secondary text-secondary-foreground hover:bg-accent",
        ghost: "text-muted-foreground hover:bg-accent hover:text-foreground",
        destructive: "bg-destructive-soft text-destructive hover:bg-destructive/20",
        link: "text-link underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 pointer-coarse:h-11",
        sm: "h-8 px-3 text-[13px] pointer-coarse:h-10",
        lg: "h-11 px-6 text-[15px]",
        xl: "h-12 px-8 text-base",
        icon: "size-9 pointer-coarse:size-11",
        "icon-sm": "size-8 pointer-coarse:size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
