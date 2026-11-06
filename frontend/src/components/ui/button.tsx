"use client";

// Button (improved: indigo-cyan-purple theme, no red/orange).

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-semibold ring-offset-background transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#05070d] disabled:pointer-events-none disabled:opacity-50 font-sans tracking-wide",
  {
    variants: {
      variant: {
        default: "bg-gradient-to-r from-indigo-500 via-violet-500 to-cyan-500 text-white hover:brightness-110 border border-indigo-400/40 hover:shadow-[0_0_32px_rgba(99,102,241,0.4)]",
        secondary:
          "bg-zinc-900/70 text-indigo-300 border border-indigo-400/30 hover:bg-indigo-500/15 hover:text-white backdrop-blur",
        outline:
          "border border-indigo-400/30 bg-transparent text-indigo-300 hover:bg-indigo-500/10 hover:text-white backdrop-blur",
        ghost: "text-slate-300 hover:bg-white/10 hover:text-white",
      },
      size: {
        default: "h-10 px-6 py-2",
        sm: "h-9 rounded-md px-4 text-sm",
        lg: "h-12 rounded-md px-10 text-lg",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
