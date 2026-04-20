import { FC, ReactNode } from "react";
import {
  ShortcutDefinition,
  useKeyboardShortcuts,
} from "./useKeyboardShortcuts";

interface KeyboardManagerProps {
  shortcuts: ShortcutDefinition[];
  children: ReactNode;
}

export const KeyboardManager: FC<KeyboardManagerProps> = ({
  shortcuts,
  children,
}) => {
  useKeyboardShortcuts(shortcuts);
  return <>{children}</>;
};
