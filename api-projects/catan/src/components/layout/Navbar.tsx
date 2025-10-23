import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { Menu, X } from 'lucide-react';

export default function Navbar() {
  const [open, setOpen] = useState(false);

  return (
    <nav className='bg-[#96251D]'>
      <div className='mx-auto max-w-6xl px-4'>
        <div className='flex h-14 items-center justify-center'>
          <div className='hidden items-center gap-2 md:flex'>
            <NavLink
              to='/'
              end
              className={({ isActive }) =>
                `block px-4 py-2 text-lg tracking-wide trajanpro-regular transition-colors ${
                  isActive ? 'text-white' : 'text-[#FCDE07]'
                }`
              }
            >
              Home
            </NavLink>
            <NavLink
              to='/game'
              className={({ isActive }) =>
                `block px-4 py-2 text-lg tracking-wide trajanpro-regular transition-colors ${
                  isActive ? 'text-white' : 'text-[#FCDE07]'
                }`
              }
            >
              Game
            </NavLink>
            <NavLink
              to='/rules'
              className={({ isActive }) =>
                `block px-4 py-2 text-lg tracking-wide trajanpro-regular transition-colors ${
                  isActive ? 'text-white' : 'text-[#FCDE07]'
                }`
              }
            >
              Rules
            </NavLink>
            <NavLink
              to='/shop'
              className={({ isActive }) =>
                `block px-4 py-2 text-lg tracking-wide trajanpro-regular transition-colors ${
                  isActive ? 'text-white' : 'text-[#FCDE07]'
                }`
              }
            >
              Shop
            </NavLink>
          </div>

          <button
            className='md:hidden inline-flex items-center justify-center p-2 rounded-md border border-white/20 text-white hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white/50'
            onClick={() => setOpen((s) => !s)}
          >
            {open ? <X /> : <Menu />}
          </button>
        </div>

        <div className={`md:hidden ${open ? 'block' : 'hidden'} pb-2`}>
          <div className='space-y-1'>
            <NavLink
              to='/'
              end
              className={({ isActive }) =>
                `block px-4 py-2 text-lg tracking-wide trajanpro-regular transition-colors ${
                  isActive ? 'text-white' : 'text-[#FCDE07]'
                }`
              }
              onClick={() => setOpen(false)}
            >
              Home
            </NavLink>
            <NavLink
              to='/game'
              className={({ isActive }) =>
                `block px-4 py-2 text-lg tracking-wide trajanpro-regular transition-colors ${
                  isActive ? 'text-white' : 'text-[#FCDE07]'
                }`
              }
              onClick={() => setOpen(false)}
            >
              Game
            </NavLink>
            <NavLink
              to='/rules'
              className={({ isActive }) =>
                `block px-4 py-2 text-lg tracking-wide trajanpro-regular transition-colors ${
                  isActive ? 'text-white' : 'text-[#FCDE07]'
                }`
              }
              onClick={() => setOpen(false)}
            >
              Rules
            </NavLink>
            <NavLink
              to='/shop'
              className={({ isActive }) =>
                `block px-4 py-2 text-lg tracking-wide trajanpro-regular transition-colors ${
                  isActive ? 'text-white' : 'text-[#FCDE07]'
                }`
              }
              onClick={() => setOpen(false)}
            >
              Shop
            </NavLink>
          </div>
        </div>
      </div>
    </nav>
  );
}
