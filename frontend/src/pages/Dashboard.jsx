
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, FolderOpen, Video, Cpu } from 'lucide-react';

const Dashboard = () => {
    const navigate = useNavigate();

    return (
        <div className="flex flex-col h-full w-full bg-theme-primary p-12 overflow-y-auto">
            <header className="mb-12">
                <h1 className="text-4xl font-bold text-white mb-2">Welcome Back, User</h1>
                <p className="text-gray-400 text-lg">Select an action to continue your labeling work.</p>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {/* New Project */}
                <button
                    onClick={() => navigate('/editor')}
                    className="flex flex-col items-start justify-between bg-gradient-to-br from-purple-900/50 to-purple-900/20 border border-purple-500/30 p-6 rounded-2xl hover:border-purple-500 transition-all hover:scale-[1.02] group h-64"
                >
                    <div className="p-3 bg-purple-600 rounded-xl mb-4 group-hover:bg-purple-500 transition-colors">
                        <Plus className="w-8 h-8 text-white" />
                    </div>
                    <div>
                        <h3 className="text-xl font-semibold text-white mb-1">New Project</h3>
                        <p className="text-gray-400 text-sm">Start labeling images from scratch</p>
                    </div>
                </button>

                {/* Open Project */}
                <button
                    onClick={() => navigate('/editor')}
                    className="flex flex-col items-start justify-between bg-theme-secondary border border-theme p-6 rounded-2xl hover:border-gray-500 transition-all hover:scale-[1.02] group h-64"
                >
                    <div className="p-3 bg-gray-700/50 rounded-xl mb-4 group-hover:bg-gray-700 transition-colors">
                        <FolderOpen className="w-8 h-8 text-gray-300" />
                    </div>
                    <div>
                        <h3 className="text-xl font-semibold text-white mb-1">Open Project</h3>
                        <p className="text-gray-400 text-sm">Continue working on existing files</p>
                    </div>
                </button>

                {/* Video Studio */}
                <button
                    onClick={() => navigate('/studio')}
                    className="flex flex-col items-start justify-between bg-theme-secondary border border-theme p-6 rounded-2xl hover:border-blue-500/50 transition-all hover:scale-[1.02] group h-64"
                >
                    <div className="p-3 bg-blue-900/30 rounded-xl mb-4 group-hover:bg-blue-800/40 transition-colors">
                        <Video className="w-8 h-8 text-blue-400" />
                    </div>
                    <div>
                        <h3 className="text-xl font-semibold text-white mb-1">Video Studio</h3>
                        <p className="text-gray-400 text-sm">Extract frames from videos</p>
                    </div>
                </button>

                {/* Model Hub */}
                <button
                    onClick={() => navigate('/models')}
                    className="flex flex-col items-start justify-between bg-theme-secondary border border-theme p-6 rounded-2xl hover:border-green-500/50 transition-all hover:scale-[1.02] group h-64"
                >
                    <div className="p-3 bg-green-900/30 rounded-xl mb-4 group-hover:bg-green-800/40 transition-colors">
                        <Cpu className="w-8 h-8 text-green-400" />
                    </div>
                    <div>
                        <h3 className="text-xl font-semibold text-white mb-1">Model Hub</h3>
                        <p className="text-gray-400 text-sm">Train and manage AI models</p>
                    </div>
                </button>
            </div>

            {/* Recent Section */}
            <div className="mt-12">
                <h2 className="text-sm uppercase tracking-wider text-gray-500 font-semibold mb-6">Recent Activity</h2>
                <div className="bg-theme-secondary border border-theme rounded-xl p-8 text-center text-gray-500">
                    <p>No recent projects found (Local Storage).</p>
                </div>
            </div>
        </div>
    );
};

export default Dashboard;
