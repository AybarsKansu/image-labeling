
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Plus, Play, Cpu, Folder, Clock, Trash2, Download } from 'lucide-react';
import { createProject, getRecentProjects, deleteProject } from '../db/projectOperations';
import { exportProjectAsZip } from '../utils/projectExport';
import ParticleNetwork from '../components/Effects/ParticleNetwork';

const Dashboard = () => {
    const navigate = useNavigate();
    const recentProjects = useLiveQuery(() => getRecentProjects());
    const [isExporting, setIsExporting] = useState(null);

    const handleNewProject = async () => {
        try {
            // Create with auto-generated name
            const newId = await createProject('');
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
        e.stopPropagation();
        if (window.confirm("Bu projeyi ve tüm dosyalarını silmek istediğinizden emin misiniz?")) {
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

    // Format relative time in Turkish
    const formatRelativeTime = (dateString) => {
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'Şimdi';
        if (diffMins < 60) return `${diffMins} dk önce`;
        if (diffHours < 24) return `${diffHours} saat önce`;
        if (diffDays === 1) return 'Dün';
        if (diffDays < 7) return `${diffDays} gün önce`;
        return date.toLocaleDateString('tr-TR');
    };

    return (
        <div className="relative flex flex-col h-full w-full bg-theme-primary overflow-hidden font-sans">
            <ParticleNetwork />

            {/* Centered Hero Section */}
            <div className="relative z-10 flex flex-col items-center justify-center min-h-[45vh] px-8 text-center">
                <h1 className="text-5xl md:text-6xl font-bold text-white mb-4 tracking-tight">
                    Veri Etiketlemenin Geleceği
                </h1>
                <p className="text-lg md:text-xl text-gray-400 max-w-2xl mb-10">
                    Hızlı, akıllı ve kesintisiz görüntü/video etiketleme platformu
                </p>

                {/* Glassmorphism Action Buttons */}
                <div className="flex flex-wrap items-center justify-center gap-4">
                    <button
                        onClick={handleNewProject}
                        className="btn-glass primary"
                    >
                        <Plus size={18} />
                        <span>Yeni Proje</span>
                    </button>

                    <button
                        className="btn-glass"
                        disabled
                        title="Yakında"
                    >
                        <Play size={18} />
                        <span>Video Studio</span>
                    </button>

                    <button
                        onClick={() => navigate('/models')}
                        className="btn-glass"
                    >
                        <Cpu size={18} />
                        <span>Modeller</span>
                    </button>
                </div>
            </div>

            {/* Recent Projects - Spotify Style List */}
            <div className="relative z-10 flex-1 px-8 pb-8 overflow-y-auto">
                <h2 className="text-sm uppercase tracking-wider text-gray-500 font-semibold mb-4 flex items-center gap-2">
                    <Clock size={14} />
                    Son Projeler
                </h2>

                {!recentProjects || recentProjects.length === 0 ? (
                    <div className="bg-theme-secondary/50 backdrop-blur-sm border border-theme rounded-xl p-8 text-center text-gray-500 border-dashed">
                        <p>Henüz proje yok. Yeni bir proje oluşturarak başlayın!</p>
                    </div>
                ) : (
                    <div className="bg-theme-secondary/30 backdrop-blur-sm rounded-xl border border-theme overflow-hidden">
                        {recentProjects.map((project, index) => (
                            <div
                                key={project.id}
                                onClick={() => handleOpenProject(project.id)}
                                className={`
                                    flex items-center gap-4 px-5 py-3.5 cursor-pointer list-item-hover
                                    ${index !== 0 ? 'border-t border-theme' : ''}
                                `}
                            >
                                {/* Icon */}
                                <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-theme-tertiary flex items-center justify-center">
                                    <Folder size={20} className="text-indigo-400" />
                                </div>

                                {/* Project Info */}
                                <div className="flex-1 min-w-0">
                                    <h3 className="text-white font-medium truncate">
                                        {project.name}
                                    </h3>
                                    <p className="text-xs text-gray-500">
                                        {project.file_count || 0} dosya
                                    </p>
                                </div>

                                {/* Last Updated */}
                                <div className="text-xs text-gray-500 hidden sm:block">
                                    {formatRelativeTime(project.updated_at)}
                                </div>

                                {/* Progress Placeholder (can be enhanced later) */}
                                <div className="w-24 hidden md:block">
                                    <div className="progress-bar">
                                        <div
                                            className="progress-bar-fill"
                                            style={{ width: `${Math.min((project.file_count || 0) * 10, 100)}%` }}
                                        />
                                    </div>
                                </div>

                                {/* Actions */}
                                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button
                                        onClick={(e) => handleExportProject(e, project)}
                                        className="p-2 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                                        title="ZIP olarak dışa aktar"
                                    >
                                        {isExporting === project.id ? (
                                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                        ) : (
                                            <Download size={16} />
                                        )}
                                    </button>
                                    <button
                                        onClick={(e) => handleDeleteProject(e, project.id)}
                                        className="p-2 rounded-lg hover:bg-red-500/20 text-gray-400 hover:text-red-400 transition-colors"
                                        title="Projeyi sil"
                                    >
                                        <Trash2 size={16} />
                                    </button>
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
