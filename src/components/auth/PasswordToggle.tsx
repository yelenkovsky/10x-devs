import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

interface PasswordToggleProps {
  visible: boolean;
  onToggle: () => void;
}

export function PasswordToggle({ visible, onToggle }: PasswordToggleProps) {
  return (
    <button
      type="button"
      data-password-toggle
      onClick={onToggle}
      className="absolute top-1/2 right-3 z-10 -translate-y-1/2 text-white/40 transition-colors hover:text-white/70"
      aria-label={visible ? "Hide password" : "Show password"}
      aria-pressed={visible}
    >
      <Eye className={cn("size-4", visible && "hidden")} data-password-icon="show" />
      <EyeOff className={cn("size-4", !visible && "hidden")} data-password-icon="hide" />
    </button>
  );
}
