/**
 * Shared catalog of icon glyphs available for `NodeGroup.icon`.
 *
 * Originally lived inline in `GraphVisualization.tsx` (the read-only
 * renderer). Lifted here so both the renderer and the right-rail
 * `GroupNodeSettings` picker can reach the same set of keys/components.
 *
 * Each entry maps a stable string key (saved to `nodeGroups[<id>].icon`)
 * to the tabler-icon React component to render. Keep the keys lowercase
 * and stable — they're persisted in template JSON.
 */

import {
  IconBolt,
  IconDeviceFloppy,
  IconScan,
  IconSettings,
  IconShieldCheck,
  IconSparkles,
  IconUser,
} from "@tabler/icons-react";
import type { ComponentType } from "react";

export interface GroupIconProps {
  size?: number | string;
  color?: string;
}

export type GroupIconComponent = ComponentType<GroupIconProps>;

export const GROUP_ICONS: Record<string, GroupIconComponent> = {
  scan: IconScan,
  cleanup: IconSparkles,
  quality: IconShieldCheck,
  human: IconUser,
  save: IconDeviceFloppy,
  prepare: IconSettings,
  process: IconBolt,
  validate: IconShieldCheck,
};

export const GROUP_ICON_KEYS: string[] = Object.keys(GROUP_ICONS);
