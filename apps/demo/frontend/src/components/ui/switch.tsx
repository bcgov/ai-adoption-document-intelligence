import * as React from "react"
import { cn } from "@/utils"

export interface SwitchProps extends React.InputHTMLAttributes<HTMLInputElement> {
  defaultChecked?: boolean
}

const Switch = React.forwardRef<HTMLInputElement, SwitchProps>(
  ({ className, defaultChecked, checked, ...props }, ref) => {
    const [internalChecked, setInternalChecked] = React.useState(defaultChecked || false)
    const isControlled = checked !== undefined
    const isChecked = isControlled ? checked : internalChecked

    return (
      <label className="relative inline-flex items-center cursor-pointer">
        <input
          type="checkbox"
          className="sr-only peer"
          ref={ref}
          checked={isChecked}
          onChange={(e) => {
            if (!isControlled) {
              setInternalChecked(e.target.checked)
            }
          }}
          {...props}
        />
        <div className={cn(
          "w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600",
          className
        )} />
      </label>
    )
  }
)
Switch.displayName = "Switch"

export { Switch }


