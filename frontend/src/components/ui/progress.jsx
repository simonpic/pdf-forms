import * as React from 'react'
import { cn } from '@/lib/utils'

const Progress = React.forwardRef(({ className, value, indicatorClassName, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('relative h-1.5 w-full overflow-hidden rounded-full bg-slate-100', className)}
    {...props}
  >
    <div
      className={cn('h-full transition-all', indicatorClassName ?? 'bg-indigo-500')}
      style={{ width: `${Math.min(100, Math.max(0, value ?? 0))}%` }}
    />
  </div>
))
Progress.displayName = 'Progress'

export { Progress }
