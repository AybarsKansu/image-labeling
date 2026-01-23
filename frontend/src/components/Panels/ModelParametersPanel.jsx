import React, { useEffect } from 'react';
import { getModelConfig } from '../../constants/modelConfig';

const ModelParametersPanel = ({
    selectedModel,
    currentParams,
    updateParam
}) => {

    const config = getModelConfig(selectedModel);

    // Style constants for "Tailwind-like" look
    const styles = {
        container: {
            background: '#1f2937', // gray-800
            border: '1px solid #374151', // gray-700
            borderRadius: '0.5rem',
            padding: '1rem',
            color: '#f3f4f6', // gray-100
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem'
        },
        header: {
            margin: 0,
            fontSize: '0.875rem',
            fontWeight: '600',
            textTransform: 'uppercase',
            borderBottom: '1px solid #374151',
            paddingBottom: '0.5rem',
            color: '#e5e7eb', // gray-200
            letterSpacing: '0.05em'
        },
        group: {
            display: 'flex',
            flexDirection: 'column',
            gap: '0.5rem'
        },
        labelRow: {
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '0.75rem',
            color: '#d1d5db' // gray-300
        },
        value: {
            color: '#60a5fa', // blue-400
            fontFamily: 'monospace'
        },
        inputRange: {
            width: '100%',
            cursor: 'pointer',
            accentColor: '#3b82f6' // blue-500
        },
        inputNumber: {
            width: '100%',
            background: '#111827', // gray-900
            border: '1px solid #4b5563', // gray-600
            color: 'white',
            borderRadius: '0.25rem',
            padding: '0.25rem 0.5rem',
            fontSize: '0.875rem'
        },
        switchContainer: {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
        },
        switchInput: {
            width: '1rem',
            height: '1rem',
            accentColor: '#10b981', // emerald-500
            cursor: 'pointer'
        },
        help: {
            fontSize: '0.65rem',
            color: '#9ca3af', // gray-400
            marginTop: '-0.25rem'
        }
    };

    return (
        <div style={styles.container}>
            <h3 style={styles.header}>
                {selectedModel ? selectedModel.split('.')[0] : 'Model'} Parameters
            </h3>

            {config.parameters.map((param) => {
                // Ensure value is controlled; default to param default if undefined
                let value = currentParams?.[param.key];
                if (value === undefined) value = param.default;

                // Conditional Rendering Logic
                if (param.key === 'tile_size' || param.key === 'tile_overlap') {
                    if (currentParams?.enable_tiling === false) return null;
                }

                return (
                    <div key={param.key} style={styles.group}>

                        {/* HEADER */}
                        <div style={styles.labelRow}>
                            <label>{param.label}</label>
                            {/* Display value for sliders is now handled by the input below */}
                        </div>

                        {/* CONTROLS */}
                        {param.type === 'slider' && (
                            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                <input
                                    type="range"
                                    min={param.min}
                                    max={param.max}
                                    step={param.step}
                                    value={value}
                                    onChange={(e) => updateParam(param.key, parseFloat(e.target.value))}
                                    style={styles.inputRange}
                                />
                                <input
                                    type="number"
                                    min={param.min}
                                    max={param.max}
                                    step={param.step}
                                    value={value}
                                    onChange={(e) => updateParam(param.key, parseFloat(e.target.value))}
                                    style={{ ...styles.inputNumber, width: '60px', padding: '0.1rem' }}
                                />
                            </div>
                        )}

                        {param.type === 'number' && (
                            <input
                                type="number"
                                min={param.min}
                                max={param.max}
                                step={param.step || 1}
                                value={value}
                                onChange={(e) => updateParam(param.key, parseFloat(e.target.value))}
                                style={styles.inputNumber}
                            />
                        )}

                        {param.type === 'switch' && (
                            <div style={styles.switchContainer}>
                                <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
                                    {value ? 'Enabled' : 'Disabled'}
                                </span>
                                <input
                                    type="checkbox"
                                    checked={!!value}
                                    onChange={(e) => updateParam(param.key, e.target.checked)}
                                    style={styles.switchInput}
                                />
                            </div>
                        )}

                        {/* HELP TEXT */}
                        {param.help && (
                            <small style={styles.help}>{param.help}</small>
                        )}

                        <div style={{ borderBottom: '1px dashed #374151', marginTop: '0.5rem', opacity: 0.5 }} />
                    </div>
                );
            })}

            {config.parameters.length === 0 && (
                <div style={{ padding: '1rem', textAlign: 'center', color: '#6b7280', fontSize: '0.875rem' }}>
                    No configurable parameters.
                </div>
            )}
        </div>
    );
};

export default ModelParametersPanel;
