// Class merger — concatenates conditional class names. Replace with
// `clsx + tailwind-merge` once those packages are added.
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}
