import React from 'react';
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList } from 'recharts';

const PerfScatterPlot = ({ data }) => {
    if (!data || data.length === 0) return null;

    // Transform data for chart
    const chartData = data.map(d => ({
        x: d["Latency (ms)"],
        y: d["mAP@0.5-0.95"],
        z: d.Model, // Label
        type: d.Model.includes('.pt') && !['yolov8n.pt', 'yolov8s.pt'].some(n => d.Model.includes(n)) ? 'Custom' : 'Official'
    }));

    return (
        <div style={{ height: '400px', background: '#1e1e1e', padding: '20px', borderRadius: '8px', marginTop: '20px' }}>
            <h3 style={{ color: '#fff', textAlign: 'center' }}>Speed vs Accuracy Trade-off</h3>
            <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#444" />
                    <XAxis
                        type="number"
                        dataKey="x"
                        name="Latency"
                        unit="ms"
                        stroke="#888"
                        label={{ value: 'Latency (ms) - Lower is Better', position: 'bottom', offset: 0, fill: '#888' }}
                    />
                    <YAxis
                        type="number"
                        dataKey="y"
                        name="mAP"
                        stroke="#888"
                        label={{ value: 'mAP@0.5-0.95 - Higher is Better', angle: -90, position: 'insideLeft', fill: '#888' }}
                    />
                    <Tooltip
                        cursor={{ strokeDasharray: '3 3' }}
                        content={({ active, payload }) => {
                            if (active && payload && payload.length) {
                                const pt = payload[0].payload;
                                return (
                                    <div style={{ background: '#333', padding: '10px', border: '1px solid #555', color: '#fff' }}>
                                        <p style={{ fontWeight: 'bold' }}>{pt.z}</p>
                                        <p>Latency: {pt.x.toFixed(2)} ms</p>
                                        <p>mAP: {pt.y.toFixed(4)}</p>
                                    </div>
                                );
                            }
                            return null;
                        }}
                    />
                    <Scatter name="Models" data={chartData} fill="#8884d8">
                        {chartData.map((entry, index) => (
                            <cell key={`cell-${index}`} fill={entry.type === 'Custom' ? '#ff7300' : '#8884d8'} />
                        ))}
                        <LabelList dataKey="z" position="top" style={{ fill: '#ccc', fontSize: '10px' }} />
                    </Scatter>
                </ScatterChart>
            </ResponsiveContainer>
        </div>
    );
};

export default PerfScatterPlot;
