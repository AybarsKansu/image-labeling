import { useState } from 'react';
import { TOOLS } from '../constants/appConstants';

export const useTools = () => {
    const [tool, setTool] = useState(TOOLS.SELECT);
    const [color, setColor] = useState('#000000ff');
    const [eraserSize, setEraserSize] = useState(20);
    const [aiBoxMode, setAiBoxMode] = useState('rect'); // 'rect' | 'lasso'

    // AI / Processing Settings
    const [settings, setSettings] = useState({
        enableAugmentation: false,
        confidenceThreshold: 50,
        textPrompt: '',
        textBoxConf: 25,
        textIou: 45
    });

    const updateSetting = (key, value) => {
        setSettings(prev => ({ ...prev, [key]: value }));
    };

    return {
        tool,
        setTool,
        color,
        setColor,
        eraserSize,
        setEraserSize,
        aiBoxMode,
        setAiBoxMode,
        settings,
        updateSetting
    };
};
