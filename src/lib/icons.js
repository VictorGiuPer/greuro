import {
  Home,
  Utensils,
  ShoppingCart,
  ShoppingBag,
  Car,
  Fuel,
  Music,
  Briefcase,
  Wifi,
  Shield,
  CreditCard,
  Smartphone,
  Dumbbell,
  GraduationCap,
  Heart,
  Plane,
  Gift,
  Coffee,
  Receipt,
  PiggyBank,
  Circle,
  ArrowLeftRight,
  Wallet,
} from 'lucide-react'

/**
 * Map of lucide icon components keyed by the `icon` name stored on a category.
 * Kept explicit (not dynamic import) so the bundle only includes icons we use.
 * Unknown names fall back to Circle.
 */
const ICONS = {
  Home,
  Utensils,
  ShoppingCart,
  ShoppingBag,
  Car,
  Fuel,
  Music,
  Briefcase,
  Wifi,
  Shield,
  CreditCard,
  Smartphone,
  Dumbbell,
  GraduationCap,
  Heart,
  Plane,
  Gift,
  Coffee,
  Receipt,
  PiggyBank,
  Circle,
  ArrowLeftRight,
  Wallet,
}

export function getIcon(name) {
  return ICONS[name] || Circle
}

/** Curated, finance-relevant icon names offered in the category icon picker. */
export const ICON_CHOICES = [
  'Home',
  'Utensils',
  'ShoppingCart',
  'ShoppingBag',
  'Car',
  'Fuel',
  'Music',
  'Briefcase',
  'Wifi',
  'Shield',
  'CreditCard',
  'Smartphone',
  'Dumbbell',
  'GraduationCap',
  'Heart',
  'Plane',
  'Gift',
  'Coffee',
  'Receipt',
  'PiggyBank',
  'Circle',
]

/** Preset color swatches from the design spec, offered in the color picker. */
export const COLOR_CHOICES = [
  '#2EE8C6', // teal
  '#6EE7B7', // mint
  '#60A5FA', // blue
  '#F59E0B', // amber
  '#A78BFA', // purple
  '#6366F1', // indigo
  '#F472B6', // pink
  '#FBBF24', // gold
  '#F87171', // red
]
