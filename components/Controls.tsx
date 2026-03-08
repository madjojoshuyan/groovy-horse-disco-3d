import React, { useState } from 'react';
import { Mic, Music } from 'lucide-react';
import { audioService } from '../services/audioService';

interface ControlsProps {
  onStart: () => Promise<void>;
  isStarted: boolean;
  isModelReady: boolean;
  hudOpacity: number;
  setHudOpacity: (val: number) => void;
}

export const Controls: React.FC<ControlsProps> = ({ onStart, isStarted, isModelReady, hudOpacity, setHudOpacity }) => {
  const [selectedSource, setSelectedSource] = useState<'mic' | 'demo'>('demo');
  const [isInitializing, setIsInitializing] = useState(false);

  const handleStart = async () => {
    setIsInitializing(true);
    // Royalty free funky beat
    const demoUrl = "https://cdn.pixabay.com/audio/2022/01/18/audio_d0a13f69d2.mp3"; 
    
    try {
        await audioService.initialize(selectedSource, demoUrl);
        await onStart();
    } catch (e) {
        console.error("Audio init failed", e);
        alert("Microphone access denied or error initializing audio.");
    } finally {
        setIsInitializing(false);
    }
  };

  if (isStarted) return null;

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="bg-gray-900 border border-purple-500 p-8 rounded-2xl shadow-[0_0_50px_rgba(168,85,247,0.4)] max-w-md w-full text-center">
        <h1 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-600 mb-6 font-sans italic">
          GROOVY HORSE 3D
        </h1>
        
        <p className="text-gray-300 mb-8 leading-relaxed">
          Allow camera access to control the horse.<br/>
          Raise <span className="text-yellow-400 font-bold">Fist</span> to Jump.<br/>
          Show <span className="text-green-400 font-bold">Palm</span> to Dance.<br/>
          Show <span className="text-cyan-400 font-bold">Peace</span> to Spin.
        </p>

        <div className="grid grid-cols-2 gap-4 mb-6">
          <button 
            onClick={() => setSelectedSource('demo')}
            className={`p-4 rounded-xl border flex flex-col items-center gap-2 transition-all ${selectedSource === 'demo' ? 'bg-purple-600 border-purple-400 text-white' : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-750'}`}
          >
            <Music size={24} />
            <span className="font-bold">Funky Music</span>
          </button>
          
          <button 
            onClick={() => setSelectedSource('mic')}
            className={`p-4 rounded-xl border flex flex-col items-center gap-2 transition-all ${selectedSource === 'mic' ? 'bg-purple-600 border-purple-400 text-white' : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-750'}`}
          >
            <Mic size={24} />
            <span className="font-bold">Microphone</span>
          </button>
        </div>

        <div className="mb-8 text-left bg-gray-800/50 p-4 rounded-xl border border-gray-700">
          <label className="block text-gray-300 text-sm font-bold mb-2 flex justify-between">
            <span>HUD Opacity</span>
            <span className="text-purple-400">{Math.round(hudOpacity * 100)}%</span>
          </label>
          <input 
            type="range" 
            min="0" 
            max="1" 
            step="0.1" 
            value={hudOpacity}
            onChange={(e) => setHudOpacity(parseFloat(e.target.value))}
            className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-purple-500"
          />
          <p className="text-xs text-gray-500 mt-2">Controls visibility of camera feed and hand tracker in-game.</p>
        </div>

        <button 
          onClick={handleStart}
          disabled={!isModelReady || isInitializing}
          className={`w-full py-4 text-white font-bold text-xl rounded-full shadow-lg transform transition disabled:opacity-50 disabled:cursor-not-allowed
            ${!isModelReady || isInitializing 
                ? 'bg-gray-600' 
                : 'bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-400 hover:to-purple-500 hover:scale-105'
            }`}
        >
          {!isModelReady 
            ? 'Loading AI Models...' 
            : isInitializing 
                ? 'Starting...' 
                : 'CLICK TO START'}
        </button>
      </div>
    </div>
  );
};