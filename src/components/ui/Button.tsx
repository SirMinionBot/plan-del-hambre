import type { ButtonHTMLAttributes } from 'react'

type Variant = 'default' | 'primary' | 'danger' | 'ghost'

const variantClasses: Record<Variant, string> = {
  default: 'border-brutal-thin shadow-brutal-sm press-brutal bg-white text-ink',
  primary: 'press-brutal bg-person-b text-white',
  danger: 'press-brutal bg-person-a text-white shadow-brutal-sm',
  ghost: 'text-person-b underline underline-offset-4',
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
}

export function Button({ variant = 'default', className = '', ...props }: ButtonProps) {
  return (
    <button
      className={`cursor-pointer rounded-2xl px-5 py-2.5 font-bold disabled:cursor-not-allowed disabled:opacity-40 ${variantClasses[variant]} ${className}`}
      {...props}
    />
  )
}
