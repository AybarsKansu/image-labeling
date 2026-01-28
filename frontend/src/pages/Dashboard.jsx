
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Plus, FolderOpen, Video, Cpu, Clock, Image as ImageIcon, Trash2, Download } from 'lucide-react';
import { createProject, getRecentProjects, deleteProject } from '../db/projectOperations';
import { exportProjectAsZip } from '../utils/projectExport';
import ParticleNetwork from '../components/Effects/ParticleNetwork';

const Dashboard = () => {
    const navigate = useNavigate();

    // Live query to fetch projects sorted by recent activity
    const recentProjects = useLiveQuery(() => getRecentProjects());
    const [isExporting, setIsExporting] = useState(null); // track which project is exporting

    const handleNewProject = async () => {
        // Create a new project with a default name (user can rename later, or prompted)
        const name = `Project ${new Date().toLocaleDateString()}`;
        try {
            const newId = await createProject(name);
            navigate(`/editor?projectId=${newId}`);
        } catch (err) {
            console.error("Failed to create project", err);
            alert("Could not create project.");
        }
    };

    const handleOpenProject = (id) => {
        navigate(`/editor?projectId=${id}`);
    };

    const handleDeleteProject = async (e, id) => {
        e.stopPropagation(); // prevent opening the project
        if (window.confirm("Are you sure you want to delete this project and all its files? This cannot be undone.")) {
            await deleteProject(id);
        }
    };

    const handleExportProject = async (e, project) => {
        e.stopPropagation();
        if (isExporting) return;

        try {
            setIsExporting(project.id);
            await exportProjectAsZip(project.id, project.name.replace(/\s+/g, '_'));
        } catch (err) {
            console.error("Export failed", err);
            alert("Export failed: " + err.message);
        } finally {
            setIsExporting(null);
        }
    };

    return (
        <div className="relative flex flex-col h-full w-full bg-theme-primary p-12 overflow-y-auto font-sans">
            <ParticleNetwork />
            <header className="mb-12 relative z-10">
                <h1 className="text-4xl font-bold text-white mb-2">My Workspace</h1>
                <p className="text-gray-400 text-lg">Manage your labeling projects and datasets.</p>
            </header>

            {/* Quick Actions Grid */}
            <div className="relative z-10 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
                {/* New Project */}
                <button
                    onClick={handleNewProject}
                    className="flex flex-col items-start justify-between bg-gradient-to-br from-purple-900/50 to-purple-900/20 border border-purple-500/30 p-6 rounded-2xl hover:border-purple-500 transition-all hover:scale-[1.02] group h-64 shadow-lg shadow-purple-900/10"
                >
                    <div className="p-3 bg-purple-600 rounded-xl mb-4 group-hover:bg-purple-500 transition-colors shadow-lg shadow-purple-900/40">
                        <Plus className="w-8 h-8 text-white" />
                    </div>
                    <div className="text-left">
                        <h3 className="text-xl font-bold text-white mb-1">New Project</h3>
                        <p className="text-purple-200/60 text-sm">Start a fresh image detection task</p>
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
                    <div className="text-left">
                        <h3 className="text-xl font-bold text-white mb-1">Model Hub</h3>
                        <p className="text-gray-400 text-sm">Train and manage AI models</p>
                    </div>
                </button>

                {/* Documentation / Help (Placeholder) */}
                <button
                    className="flex flex-col items-start justify-between bg-theme-secondary border border-theme p-6 rounded-2xl hover:border-gray-500 transition-all hover:scale-[1.02] group h-64 opacity-50 hover:opacity-100"
                >
                    <div className="p-3 bg-gray-700/50 rounded-xl mb-4 group-hover:bg-gray-700 transition-colors">
                        <FolderOpen className="w-8 h-8 text-gray-300" />
                    </div>
                    <div className="text-left">
                        <h3 className="text-xl font-bold text-white mb-1">Documentation</h3>
                        <p className="text-gray-400 text-sm">Learn how to use the tool</p>
                    </div>
                </button>
            </div>

            {/* Recent Section */}
            <div className="relative z-10">
                <h2 className="text-sm uppercase tracking-wider text-gray-500 font-bold mb-6 flex items-center gap-2">
                    <Clock size={16} /> Recent Projects
                </h2>

                {!recentProjects || recentProjects.length === 0 ? (
                    <div className="bg-theme-secondary border border-theme rounded-xl p-12 text-center text-gray-500 border-dashed">
                        <p>No recent projects found. Create one to get started!</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                        {recentProjects.map(project => (
                            <div
                                key={project.id}
                                onClick={() => handleOpenProject(project.id)}
                                className="bg-theme-secondary border border-theme rounded-xl overflow-hidden hover:border-gray-500 transition-all hover:shadow-2xl cursor-pointer group relative"
                            >
                                {/* Thumbnail */}
                                <div className="h-40 bg-black/50 w-full object-cover flex items-center justify-center relative border-b border-theme">
                                    {project.thumbnail ? (
                                        <img src={project.thumbnail} alt="" className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
                                    ) : (
                                        <div className="text-gray-600">
                                            <ImageIcon size={48} opacity={0.2} />
                                        </div>
                                    )}

                                    {/* Overlay Actions */}
                                    <div className="absolute top-2 right-2 flex gap-2 opacity-0 group-hover:opacity-100 transition-all">
                                        <button
                                            onClick={(e) => handleExportProject(e, project)}
                                            className="p-2 bg-black/60 hover:bg-blue-600/80 rounded-full text-white backdrop-blur-sm"
                                            title="Export ZIP"
                                        >
                                            {isExporting === project.id ? (
                                                <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                            ) : (
                                                <Download size={14} />
                                            )}
                                        </button>
                                        <button
                                            onClick={(e) => handleDeleteProject(e, project.id)}
                                            className="p-2 bg-black/60 hover:bg-red-600/80 rounded-full text-white backdrop-blur-sm"
                                            title="Delete Project"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                </div>

                                {/* Info */}
                                <div className="p-4">
                                    <h3 className="text-white font-semibold truncate pr-2 mb-1" title={project.name}>
                                        {project.name}
                                    </h3>
                                    <div className="flex justify-between items-center text-xs text-gray-500 mt-2">
                                        <span className="flex items-center gap-1">
                                            <ImageIcon size={12} /> {project.file_count || 0} Files
                                        </span>
                                        <span>
                                            {new Date(project.updated_at).toLocaleDateString()}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default Dashboard;
