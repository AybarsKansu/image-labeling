import React, { useState, useMemo } from 'react';

const BenchmarkTable = ({ data, onOptimize }) => {
    const [showPretrained, setShowPretrained] = useState(true);

    // Identify "best" values to highlight
    const bestMetrics = useMemo(() => {
        if (!data || data.length === 0) return {};
        return {
            maxMap: Math.max(...data.map(d => d["mAP@0.5-0.95"] || 0)),
            minLatency: Math.min(...data.filter(d => d["Latency (ms)"] > 0).map(d => d["Latency (ms)"])),
            maxFps: Math.max(...data.map(d => d["Throughput (FPS)"] || 0)),
        };
    }, [data]);

    const filteredData = useMemo(() => {
        if (!data) return [];
        return showPretrained
            ? data
            : data.filter(d => !d.Model.endsWith('.pt') || !['yolov8n.pt', 'yolov8s.pt', 'yolov8m.pt', 'yolov8l.pt', 'yolov8x.pt', 'yolov11n.pt', 'yolov11s.pt', 'yolo11m.pt'].includes(d.Model));
        // Simple heuristic for "official" models, or check if file size is typical
        // Actually, best way is to flag them in backend, but for now filtering by common names is OK.
        // Or better: Use the "Custom Model" logic from backend if available.
    }, [data, showPretrained]);

    const isBest = (val, target) => val === target && target !== 0;

    return (
        <div className="benchmark-table-container" style={{ padding: '20px', background: '#1e1e1e', borderRadius: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '15px' }}>
                <h3 style={{ color: '#fff' }}>Comparative Benchmarks</h3>
                <button
                    onClick={() => setShowPretrained(!showPretrained)}
                    style={{ padding: '8px 16px', borderRadius: '4px', background: '#333', color: '#fff', border: '1px solid #555', cursor: 'pointer' }}
                >
                    {showPretrained ? 'Hide Pretrained Models' : 'Show All Models'}
                </button>
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', color: '#ccc' }}>
                <thead>
                    <tr style={{ background: '#252526', textAlign: 'left' }}>
                        <th style={{ padding: '10px' }}>Model</th>
                        <th style={{ padding: '10px' }}>mAP@0.5-0.95</th>
                        <th style={{ padding: '10px' }}>mAP@0.5</th>
                        <th style={{ padding: '10px' }}>Latency (ms)</th>
                        <th style={{ padding: '10px' }}>FPS</th>
                        <th style={{ padding: '10px' }}>VRAM (MB)</th>
                        <th style={{ padding: '10px' }}>Size (MB)</th>
                        <th style={{ padding: '10px' }}>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {filteredData.map((row, idx) => (
                        <tr key={idx} style={{ borderBottom: '1px solid #333' }}>
                            <td style={{ padding: '10px', fontWeight: 'bold', color: '#fff' }}>{row.Model}</td>

                            <td style={{ padding: '10px', color: isBest(row["mAP@0.5-0.95"], bestMetrics.maxMap) ? '#4caf50' : 'inherit' }}>
                                {(row["mAP@0.5-0.95"] || 0).toFixed(4)}
                            </td>

                            <td style={{ padding: '10px' }}>{(row["mAP@0.5"] || 0).toFixed(4)}</td>

                            <td style={{ padding: '10px', color: isBest(row["Latency (ms)"], bestMetrics.minLatency) ? '#4caf50' : 'inherit' }}>
                                {(row["Latency (ms)"] || 0).toFixed(2)}
                            </td>

                            <td style={{ padding: '10px', color: isBest(row["Throughput (FPS)"], bestMetrics.maxFps) ? '#4caf50' : 'inherit' }}>
                                {(row["Throughput (FPS)"] || 0).toFixed(1)}
                            </td>

                            <td style={{ padding: '10px' }}>{(row["Peak VRAM (MB)"] || 0).toFixed(0)}</td>
                            <td style={{ padding: '10px' }}>{(row["File Size (MB)"] || 0).toFixed(1)}</td>

                            <td style={{ padding: '10px' }}>
                                {!row.Model.includes('.onnx') && !row.Model.includes('.engine') && (
                                    <button
                                        onClick={() => onOptimize(row.Model)}
                                        style={{ padding: '5px 10px', fontSize: '12px', background: '#007acc', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                                    >
                                        Optimize
                                    </button>
                                )}
                            </td>
                        </tr>
                    ))}
                    {filteredData.length === 0 && (
                        <tr><td colSpan="8" style={{ padding: '20px', textAlign: 'center' }}>No benchmark data available.</td></tr>
                    )}
                </tbody>
            </table>
        </div>
    );
};

export default BenchmarkTable;
