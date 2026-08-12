import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useMenuData } from '@/lib/menuData';
import {
  LayoutDashboard, UtensilsCrossed, ChefHat, Carrot, Receipt, Package,
  BarChart3, ListChecks, FileBarChart, Settings as SettingsIcon, Menu as MenuIcon, X
} from 'lucide-react';

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/menu', label: 'Menu', icon: UtensilsCrossed },
  { to: '/recipes', label: 'Recipes', icon: ChefHat },
  { to: '/ingredients', label: 'Ingredients', icon: Carrot },
  { to: '/invoices', label: 'Supplier Invoices', icon: Receipt },
  { to: '/packaging', label: 'Packaging', icon: Package },
  { to: '/engineering', label: 'Menu Engineering', icon: BarChart3 },
  { to: '/portion-guides', label: 'Portion Guides', icon: ListChecks },
  { to: '/reports', label: 'Reports', icon: FileBarChart },
  { to: '/settings', label: 'Settings', icon: SettingsIcon }
];

export default function Layout() {
  const [open, setOpen] = useState(false);
  const { business } = useMenuData();
  const location = useLocation();

  return (
    <div className="min-h-screen bg-white text-neutral-900 flex">
      {/* Sidebar */}
      <aside
        className={`fixed lg:static inset-y-0 left-0 z-40 w-64 bg-white border-r border-neutral-200 flex flex-col transition-transform duration-200 ${
          open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="h-16 flex items-center gap-2 px-5 border-b border-neutral-200">
          <div className="w-8 h-8 rounded-lg bg-emerald-600 flex items-center justify-center text-white font-bold">M</div>
          <div>
            <div className="font-semibold leading-tight">MenuMargin</div>
            <div className="text-xs text-neutral-500 leading-tight">{business?.name || 'Set up business'}</div>
          </div>
          <button className="ml-auto lg:hidden text-neutral-400" onClick={() => setOpen(false)}>
            <X className="w-5 h-5" />
          </button>
        </div>
        <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
          {NAV.map((n) => {
            const Icon = n.icon;
            return (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                onClick={() => setOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900'
                  }`
                }
              >
                <Icon className="w-[18px] h-[18px]" />
                {n.label}
              </NavLink>
            );
          })}
        </nav>
        <div className="p-3 text-xs text-neutral-400 border-t border-neutral-200">
          Autosave active · v1.0
        </div>
      </aside>

      {open && <div className="fixed inset-0 bg-black/30 z-30 lg:hidden" onClick={() => setOpen(false)} />}

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 lg:hidden flex items-center px-4 border-b border-neutral-200 sticky top-0 bg-white z-20">
          <button className="text-neutral-600" onClick={() => setOpen(true)}>
            <MenuIcon className="w-6 h-6" />
          </button>
          <span className="ml-3 font-semibold">MenuMargin</span>
        </header>
        <main key={location.pathname} className="flex-1 min-w-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
}