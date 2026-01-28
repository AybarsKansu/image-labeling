
import React from 'react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { Home, Edit3, Video, Cpu, Settings, FolderOpen } from 'lucide-react';
import clsx from 'clsx';

const MainLayout = () => {
    const location = useLocation();

    const navItems = [
        { path: '/', icon: Home, label: 'Dashboard' },
        { path: '/editor', icon: Edit3, label: 'Editor' },
        { path: '/models', icon: Cpu, label: 'Model Hub' },
    ];

    return (
        <div className="flex h-screen w-screen bg-theme-primary text-theme-primary overflow-hidden font-sans">
            {/* Narrow Sidebar */}
            <aside className="w-16 flex flex-col items-center py-4 bg-theme-secondary border-r border-theme z-50">

                <nav className="flex-1 flex flex-col gap-4 w-full px-2">
                    {navItems.map((item) => (
                        <NavLink
                            key={item.path}
                            to={item.path === '/editor'
                                ? (localStorage.getItem('lastActiveProjectId')
                                    ? `/editor?projectId=${localStorage.getItem('lastActiveProjectId')}`
                                    : '/editor')
                                : item.path
                            }
                            className={({ isActive }) => clsx(
                                "flex flex-col items-center justify-center p-2 rounded-lg transition-all gap-1 group",
                                isActive
                                    ? "bg-purple-600/20 text-purple-400"
                                    : "text-gray-500 hover:text-gray-300 hover:bg-white/5"
                            )}
                            title={item.label}
                        >
                            <item.icon className="w-6 h-6" />
                        </NavLink>
                    ))}
                </nav>

                <div className="mt-auto flex flex-col gap-4 w-full px-2">
                    <button className="flex flex-col items-center justify-center p-2 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-white/5 transition-all">
                        <Settings className="w-6 h-6" />
                    </button>
                </div>
            </aside>

            {/* Main Content Area */}
            <main className="flex-1 overflow-hidden relative">
                <Outlet />
            </main>
        </div>
    );
};

export default MainLayout;
