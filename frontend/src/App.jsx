import React, { useState } from 'react';
import './App.css';
import ModelManagerModal from './components/ModelManagerModal';
import TrainPanel from './components/TrainPanel';
import AnnotationApp from '../pages/AnnotationApp'; // Check if this path logic holds or needs adjustment based on folder structure

function App() {
  const [showModelManager, setShowModelManager] = useState(false);
  const [showTrainPanel, setShowTrainPanel] = useState(false);

  // In 2026, we want a premium feel.

  const [selectedModel, setSelectedModel] = useState('yolov8m-seg.pt');

  // Load available models locally if easier, or let App fetch initial list? 
  // For now, simple default is fine. AnnotationApp fetches usually, but now App controls "The One".

  return (
    <div className="App">
      {/* Premium Header */}
      <header className="app-header">
        <div className="nav-actions">
          <button
            className={`nav-btn ${showModelManager ? 'active' : ''}`}
            onClick={() => setShowModelManager(true)}
          >
            <span>⚡</span> Models
          </button>
          <button
            className={`nav-btn ${showTrainPanel ? 'active' : ''}`}
            onClick={() => setShowTrainPanel(true)}
          >
            <span>🔥</span> Train
          </button>
        </div>
      </header>

      {/* Main Workspace */}
      <main className="main-workspace">
        <AnnotationApp selectedModel={selectedModel} setSelectedModel={setSelectedModel} />
      </main>

      {/* Modals & Overlay Panels */}
      <ModelManagerModal
        isOpen={showModelManager}
        onClose={() => setShowModelManager(false)}
        activeModel={selectedModel}
        onSelectModel={setSelectedModel}
      />

      <TrainPanel
        isOpen={showTrainPanel}
        onClose={() => setShowTrainPanel(false)}
      />
    </div>
  );
}

export default App;
