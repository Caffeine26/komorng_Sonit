import React from "react";
import { cn } from "@/lib/utils/cn";
import { useSettingsContext } from "./SettingsContext";

interface SettingsSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  className?: string;
  disabled?: boolean;
}

export function SettingsSwitch({ checked, onChange, className, disabled }: SettingsSwitchProps) {
  const { isEditing } = useSettingsContext();
  const isDisabled = disabled || !isEditing;

  return (
    <button
      type="button"
      disabled={isDisabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
        checked ? "bg-primary" : "bg-zinc-200",
        isDisabled && "opacity-50 cursor-default",
        className
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
          checked ? "translate-x-5" : "translate-x-0"
        )}
      />
    </button>
  );
}
