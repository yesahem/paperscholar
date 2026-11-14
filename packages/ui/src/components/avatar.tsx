"use client";

import { cva, type VariantProps } from "class-variance-authority";
import { useState, type ComponentProps } from "react";
import { avatarInitial } from "../lib/avatar";
import { cn } from "../lib/cn";

export const avatarVariants = cva(
  "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-muted font-medium text-muted-foreground select-none",
  {
    variants: {
      size: {
        sm: "size-6 text-xs",
        md: "size-8 text-sm",
        lg: "size-12 text-lg",
        xl: "size-24 text-3xl",
      },
    },
    defaultVariants: { size: "md" },
  },
);

export interface AvatarProps
  extends Omit<ComponentProps<"span">, "children">, VariantProps<typeof avatarVariants> {
  /** The image's URL; null shows the initial. */
  src: string | null;
  /** Whose avatar this is. Used for the initial and, unless `decorative`, the alt text. */
  name: string;
  /**
   * When the name is already shown next to it, the avatar is decorative and
   * hidden from screen readers, so the name is not read twice.
   */
  decorative?: boolean;
}

/**
 * A user's picture in a circle, or the first letter of their name when there
 * is none or it fails to load. The image is cropped to fill the circle.
 */
export function Avatar({
  src,
  name,
  size,
  decorative = false,
  className,
  ...props
}: AvatarProps) {
  const [failed, setFailed] = useState<string | null>(null);
  const showImage = src !== null && failed !== src;
  return (
    <span
      className={cn(avatarVariants({ size }), className)}
      {...(decorative
        ? { "aria-hidden": true }
        : showImage
          ? {}
          : { role: "img", "aria-label": name })}
      {...props}
    >
      {showImage ? (
        <img
          src={src}
          alt={decorative ? "" : name}
          className="size-full object-cover"
          loading="lazy"
          decoding="async"
          onError={() => setFailed(src)}
        />
      ) : (
        <span aria-hidden="true">{avatarInitial(name)}</span>
      )}
    </span>
  );
}
