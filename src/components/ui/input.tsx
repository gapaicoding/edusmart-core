import * as React from "react";

import { cn } from "@/lib/utils";
import { translateUiText, useOptionalAppPreferences } from "@/lib/app-preferences";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, placeholder, ...props }, ref) => {
    const preferences = useOptionalAppPreferences();
    return (
      <input
        type={type}
        className={cn(
          "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className,
        )}
        ref={ref}
        placeholder={
          placeholder && preferences
            ? translateUiText(placeholder, preferences.locale)
            : placeholder
        }
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
