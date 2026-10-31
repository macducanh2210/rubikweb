import { Link, type LinkProps } from 'react-router-dom'

export function AuthLink({ className = '', ...props }: LinkProps) {
  return <Link className={`text-small font-medium text-link underline-offset-2 hover:underline ${className}`} {...props} />
}
