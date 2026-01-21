import React, { useState } from 'react';
import './App.css';
import ModelManagerModal from './components/ModelManagerModal';
import TrainPanel from './components/TrainPanel';
import AnnotationApp from './components/AnnotationApp';

function App() {
  const [showModelManager, setShowModelManager] = useState(false);
  const [showTrainPanel, setShowTrainPanel] = useState(false);

  // In 2026, we want a premium feel.

  const [selectedModel, setSelectedModel] = useState('yolov8m-seg.pt');

  // Load available models locally if easier, or let App fetch initial list? 
  // For now, simple default is fine. AnnotationApp fetches usually, but now App controls "The One".

  return (
    <div className="App">
      {/* Main Workspace */}
      <main className="main-workspace">
        <AnnotationApp
          selectedModel={selectedModel}
          setSelectedModel={setSelectedModel}
          onOpenModelManager={() => setShowModelManager(true)}
        />
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
