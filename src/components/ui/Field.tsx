import type { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'

const fieldClasses =
  'w-full border-brutal-thin bg-white px-3 py-2 focus:outline-none focus:bg-warn/20'

interface LabelledProps {
  label?: string
}

export function Input({ label, className = '', ...props }: InputHTMLAttributes<HTMLInputElement> & LabelledProps) {
  const input = <input className={`${fieldClasses} ${className}`} {...props} />
  if (!label) return input
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-bold uppercase">{label}</span>
      {input}
    </label>
  )
}

export function Select({ label, className = '', children, ...props }: SelectHTMLAttributes<HTMLSelectElement> & LabelledProps) {
  const select = (
    <select className={`${fieldClasses} ${className}`} {...props}>
      {children}
    </select>
  )
  if (!label) return select
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-bold uppercase">{label}</span>
      {select}
    </label>
  )
}

export function Textarea({ label, className = '', ...props }: TextareaHTMLAttributes<HTMLTextAreaElement> & LabelledProps) {
  const textarea = <textarea className={`${fieldClasses} ${className}`} {...props} />
  if (!label) return textarea
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-bold uppercase">{label}</span>
      {textarea}
    </label>
  )
}
