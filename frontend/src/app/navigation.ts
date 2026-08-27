import type { LucideIcon } from 'lucide-react';
import {
  CalendarPlus,
  LayoutDashboard,
  Search,
  UserCircle
} from 'lucide-react';
import type { UserRole } from '../types/api';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  roles: UserRole[];
}

export const navItems: NavItem[] = [
  {
    to: '/dashboard',
    label: 'Dashboard',
    icon: LayoutDashboard,
    roles: ['PATIENT', 'DOCTOR', 'ADMIN']
  },
  {
    to: '/appointments/new',
    label: 'Book appointment',
    icon: CalendarPlus,
    roles: ['PATIENT', 'ADMIN']
  },
  {
    to: '/appointments/lookup',
    label: 'Find appointment',
    icon: Search,
    roles: ['PATIENT', 'DOCTOR', 'ADMIN']
  },
  {
    to: '/profile',
    label: 'Profile',
    icon: UserCircle,
    roles: ['PATIENT', 'DOCTOR', 'ADMIN']
  }
];

export function navItemsForRole(role: UserRole): NavItem[] {
  return navItems.filter((item) => item.roles.includes(role));
}

const pageTitles: Array<{ pattern: RegExp; title: string }> = [
  { pattern: /^\/dashboard(\/.*)?$/, title: 'Dashboard' },
  { pattern: /^\/appointments\/new$/, title: 'Book appointment' },
  { pattern: /^\/appointments\/lookup$/, title: 'Find appointment' },
  { pattern: /^\/appointments\/[^/]+$/, title: 'Appointment details' },
  { pattern: /^\/profile$/, title: 'Profile' },
  { pattern: /^\/unauthorized$/, title: 'Access denied' }
];

export function pageTitleForPath(pathname: string): string {
  const match = pageTitles.find((entry) => entry.pattern.test(pathname));
  return match?.title ?? 'Healthcare Appointments';
}
