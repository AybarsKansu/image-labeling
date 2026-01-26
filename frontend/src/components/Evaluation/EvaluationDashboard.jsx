import React, { useState, useEffect } from 'react';
import axios from 'axios';
import BenchmarkTable from './BenchmarkTable';
import PerfScatterPlot from './PerfScatterPlot';
import FailureGallery from './FailureGallery';
import BenchmarkWizard from './BenchmarkWizard';

const API_BASE = "http://localhost:8000/api/evaluation"; // or your config

const EvaluationDashboard = ({ availableModels = [] }) => {
    const [activeTab, setActiveTab] = useState('benchmarks');
    const [benchmarkData, setBenchmarkData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [taskId, setTaskId] = useState(null);
    const [analyzingModel, setAnalyzingModel] = useState(null);
    const [failureImages, setFailureImages] = useState([]);

    // Wizard State
    const [showWizard, setShowWizard] = useState(false);

    // Poll for task status
    useEffect(() => {
        let interval;
        if (taskId) {
            interval = setInterval(async () => {
                try {
                    const res = await axios.get(`${API_BASE}/tasks/${taskId}`);
                    const { status, result, error } = res.data;

                    if (status === 'completed') {
                        // Determine if it was benchmark or optimize based on result structure
                        // For simplicity, we just assume it updates benchmarkData if it's an array
                        if (Array.isArray(result)) {
                            // Merge or replace? Let's append or update.
                            // For this demo, just replace is easier, or merge carefully
                            setBenchmarkData(prev => {
                                // Naive merge: remove duplicates by Model name
                                const incoming = result;
                                const existing = prev.filter(p => !incoming.find(i => i.Model === p.Model));
                                return [...existing, ...incoming];
                            });
                        }
                        setLoading(false);
                        setTaskId(null);
                        clearInterval(interval);
                    } else if (status === 'failed') {
                        console.error("Task failed:", error);
                        alert(`Task failed: ${error}`);
                        setLoading(false);
                        setTaskId(null);
                        clearInterval(interval);
                    }
                } catch (err) {
                    console.error("Polling error", err);
                }
            }, 2000);
        }
        return () => clearInterval(interval);
    }, [taskId]);

    const handleWizardRun = async (config) => {
        setShowWizard(false);
        setLoading(true);
        try {
            const res = await axios.post(`${API_BASE}/benchmark`, {
                models: config.models,
                test_set_config: config.test_set_config
            });
            setTaskId(res.data.task_id);
        } catch (err) {
            console.error(err);
            setLoading(false);
            alert("Failed to start benchmark task.");
        }
    };

    const optimizeModel = async (modelName) => {
        setLoading(true);
        try {
            const res = await axios.post(`${API_BASE}/optimize`, {
                model_name: modelName,
                format: "onnx"
            });
            setTaskId(res.data.task_id);
        } catch (err) {
            console.error(err);
            setLoading(false);
        }
    };

    const fetchFailures = async (modelName) => {
        setAnalyzingModel(modelName);
        try {
            const res = await axios.get(`${API_BASE}/failures/${modelName}`);
            setFailureImages(res.data.images);
            setActiveTab('failures');
        } catch (err) {
            console.error(err);
            alert("Failed to load failures.");
        }
    };

    return (
        <div style={{ height: '100%', overflowY: 'auto', padding: '20px', color: '#ccc', background: '#121212', position: 'relative' }}>

            {showWizard && (
                <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.7)', zIndex: 10 }}>
                    <BenchmarkWizard
                        models={availableModels.filter(m => m.is_downloaded)}
                        onRun={handleWizardRun}
                        onCancel={() => setShowWizard(false)}
                    />
                </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h1 style={{ margin: 0, color: '#fff' }}>Evaluation & Optimization Hub</h1>
                <div style={{ display: 'flex', gap: '10px' }}>
                    <button
                        disabled={loading}
                        onClick={() => setShowWizard(true)}
                        style={{ padding: '10px 20px', background: loading ? '#555' : '#007acc', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                    >
                        {loading ? 'Processing...' : 'Run New Benchmark'}
                    </button>
                    {loading && <span style={{ alignSelf: 'center', color: '#007acc' }}>Task ID: {taskId?.slice(0, 8)}...</span>}
                </div>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', borderBottom: '1px solid #333', marginBottom: '20px' }}>
                {['benchmarks', 'failures'].map(tab => (
                    <div
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        style={{
                            padding: '10px 20px',
                            cursor: 'pointer',
                            color: activeTab === tab ? '#007acc' : '#888',
                            borderBottom: activeTab === tab ? '2px solid #007acc' : 'none',
                            fontWeight: activeTab === tab ? 'bold' : 'normal'
                        }}
                    >
                        {tab.charAt(0).toUpperCase() + tab.slice(1)}
                    </div>
                ))}
            </div>

            {activeTab === 'benchmarks' && (
                <>
                    <BenchmarkTable data={benchmarkData} onOptimize={optimizeModel} />
                    <PerfScatterPlot data={benchmarkData} />

                    {/* Quick helper to load failures from table? For now, list models to analyze */}
                    {benchmarkData.length > 0 && (
                        <div style={{ marginTop: '20px', padding: '20px', background: '#1e1e1e', borderRadius: '8px' }}>
                            <h3 style={{ color: '#fff' }}>Deep Analysis</h3>
                            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                                {benchmarkData.map(d => (
                                    <button
                                        key={d.Model}
                                        onClick={() => fetchFailures(d.Model)}
                                        style={{ padding: '8px 16px', background: '#333', color: '#fff', border: '1px solid #555', borderRadius: '4px', cursor: 'pointer' }}
                                    >
                                        Analyze Failures: {d.Model}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </>
            )}

            {activeTab === 'failures' && (
                <FailureGallery modelId={analyzingModel} failures={failureImages} />
            )}
        </div>
    );
};

export default EvaluationDashboard;
