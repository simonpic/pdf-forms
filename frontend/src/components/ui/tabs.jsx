import { createContext, useContext, useState } from 'react'
import { cn } from '@/lib/utils'

const TabsContext = createContext({ value: '', onChange: () => {} })

function Tabs({ defaultValue, value, onValueChange, children, className }) {
  const [internal, setInternal] = useState(defaultValue ?? '')
  const current = value !== undefined ? value : internal
  const handleChange = (v) => {
    setInternal(v)
    onValueChange?.(v)
  }
  return (
    <TabsContext.Provider value={{ value: current, onChange: handleChange }}>
      <div className={cn('', className)}>{children}</div>
    </TabsContext.Provider>
  )
}

function TabsList({ children, className }) {
  return (
    <div className={cn('flex gap-1 rounded-lg bg-slate-100 p-1', className)}>
      {children}
    </div>
  )
}

function TabsTrigger({ value, children, className }) {
  const { value: current, onChange } = useContext(TabsContext)
  const isActive = current === value
  return (
    <button
      className={cn(
        'flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
        isActive
          ? 'bg-white text-indigo-700 shadow-sm'
          : 'text-slate-500 hover:text-slate-800',
        className
      )}
      onClick={() => onChange(value)}
    >
      {children}
    </button>
  )
}

function TabsContent({ value, children }) {
  const { value: current } = useContext(TabsContext)
  if (current !== value) return null
  return <>{children}</>
}

export { Tabs, TabsList, TabsTrigger, TabsContent }
