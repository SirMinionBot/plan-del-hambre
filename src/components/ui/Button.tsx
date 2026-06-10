import type { ButtonHTMLAttributes } from 'react'

type Variant = 'default' | 'primary' | 'danger' | 'ghost'

const variantClasses: Record<Variant, string> = {
  default: 'border-brutal-thin shadow-brutal press-brutal bg-white',
  primary: 'border-brutal-thin shadow-brutal press-brutal bg-warn',
  danger: 'border-brutal-thin shadow-brutal press-brutal bg-person-a text-white',
  ghost: 'underline underline-offset-4',
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
}

export function Button({ variant = 'default', className = '', ...props }: ButtonProps) {
  return (
    <button
      className={`cursor-pointer px-4 py-2 font-bold uppercase tracking-tight disabled:cursor-not-allowed disabled:opacity-40 ${variantClasses[variant]} ${className}`}
      {...props}
    />
  )
}
