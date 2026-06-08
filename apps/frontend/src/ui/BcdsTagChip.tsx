import {
  Tag as BcdsTag,
  TagGroup,
  TagList,
} from "@bcgov/design-system-react-components";
import type { ComponentPropsWithoutRef } from "react";

type BcdsTagItem = ComponentPropsWithoutRef<typeof BcdsTag>;

export interface BcdsTagChipProps {
  id?: string;
  textValue: string;
  color?: BcdsTagItem["color"];
  size?: BcdsTagItem["size"];
  tagStyle?: BcdsTagItem["tagStyle"];
  icon?: BcdsTagItem["icon"];
}

/** BC DS `Tag` must render inside `TagGroup` + `TagList` (React Aria collection). */
export function BcdsTagChip({
  id,
  textValue,
  color,
  size,
  tagStyle = "circular",
  icon,
}: BcdsTagChipProps) {
  const tagId = id ?? "tag";
  const label = textValue.trim() || "Tag";

  const items: BcdsTagItem[] = [
    {
      id: tagId,
      textValue: label,
      color,
      size,
      tagStyle,
      icon,
    },
  ];

  return (
    <TagGroup aria-label={label}>
      <TagList items={items} />
    </TagGroup>
  );
}
