import React, { useEffect, useRef, useState } from 'react';
import { DiscoScene } from './components/DiscoScene';
import { Controls } from './components/Controls';
import { visionService } from './services/visionService';
import { audioService } from './services/audioService';
import { Camera, Music, Mic, RefreshCw, ArrowLeft } from 'lucide-react';
import { Gesture } from './types';

export default function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isStarted, setIsStarted] = useState(false);
  const [isModelReady, setIsModelReady] = useState(false);
  const [cameraError, setCameraError] = useState(false);
  const [audioSource, setAudioSource] = useState<'demo' | 'mic'>('demo');
  const [hudOpacity, setHudOpacity] = useState(1);
  const handCursorRef = useRef<HTMLDivElement>(null);

  // Preload Assets
  useEffect(() => {
    const preloadResources = async () => {
        // 1. Preload Vision Model
        try {
            await visionService.initialize();
            setIsModelReady(true);
        } catch (e) {
            console.error("Vision model failed to load", e);
        }

        // 2. Preload Audio
        const audio = new Audio("https://cdn.pixabay.com/audio/2022/01/18/audio_d0a13f69d2.mp3");
        audio.preload = 'auto';
        audio.load();
    };

    preloadResources();
  }, []);

  const toggleAudioSource = async () => {
    const newSource = audioSource === 'demo' ? 'mic' : 'demo';
    setAudioSource(newSource);
    const demoUrl = "https://cdn.pixabay.com/audio/2022/01/18/audio_d0a13f69d2.mp3"; 
    await audioService.initialize(newSource, demoUrl);
  };

  const handleStart = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { 
                width: 640,
                height: 480,
                facingMode: 'user'
            } 
        });
        
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(e => console.error("Video play error:", e));
        }
        setCameraError(false);
      } catch (err) {
        console.error("Error accessing camera:", err);
        setCameraError(true);
      }
      setIsStarted(true);
  };

  const handleGestureDetected = React.useCallback(async (gesture: Gesture) => {
      if (!isStarted && gesture === Gesture.Victory) {
          setIsStarted(true);
          // Attempt to start audio (might be blocked by browser policy without click, but we try)
          try {
              const demoUrl = "https://cdn.pixabay.com/audio/2022/01/18/audio_d0a13f69d2.mp3";
              await audioService.initialize('demo', demoUrl);
          } catch(e) {
              console.warn("Auto-audio start failed (likely browser policy). User can enable manually.");
          }
      }
  }, [isStarted]);

  const handleBackToStart = () => {
      setIsStarted(false);
      audioService.stop();
      if (videoRef.current && videoRef.current.srcObject) {
          const stream = videoRef.current.srcObject as MediaStream;
          stream.getTracks().forEach(track => track.stop());
          videoRef.current.srcObject = null;
      }
  };

  return (
    <div className="relative w-full h-screen bg-black text-white overflow-hidden font-sans">
      
      {/* 3D Scene Background */}
      <DiscoScene 
        videoRef={videoRef} 
        isActive={isStarted} 
        onGestureDetected={handleGestureDetected}
        handCursorRef={handCursorRef}
      />

      {/* Start UI */}
      <Controls 
        isStarted={isStarted} 
        onStart={handleStart} 
        isModelReady={isModelReady}
        hudOpacity={hudOpacity}
        setHudOpacity={setHudOpacity}
      />

      {/* Camera is always rendering for detection, but hidden/shown based on state */}
      <video 
          ref={videoRef} 
          className="fixed top-0 left-0 opacity-0 pointer-events-none w-64 h-48 -z-10" // Hidden from DOM flow, used by Three.js/Vision
          playsInline 
          muted
      />

      {/* Runtime Controls & Overlays */}
      {isStarted && (
        <>
            {/* Back to Start Button (Not affected by HUD Opacity) */}
            <div className="absolute top-4 left-4 z-50">
                <button 
                    onClick={handleBackToStart}
                    className="flex items-center gap-2 bg-red-600/90 backdrop-blur border border-red-400/50 text-white px-4 py-2 rounded-full hover:bg-red-500 transition-colors shadow-lg"
                >
                    <ArrowLeft size={16} />
                    <span className="text-sm font-bold uppercase tracking-wider">Back to Start</span>
                </button>
            </div>

            {/* HUD Container (Affected by Opacity) */}
            <div style={{ opacity: hudOpacity }} className="transition-opacity duration-300 pointer-events-none">
                {/* Audio Switcher */}
                <div className="absolute top-16 left-4 z-40 pointer-events-auto">
                    <button 
                        onClick={toggleAudioSource}
                        className="flex items-center gap-2 bg-gray-900/80 backdrop-blur border border-purple-500/50 text-white px-4 py-2 rounded-full hover:bg-gray-800 transition-colors shadow-lg"
                    >
                        {audioSource === 'demo' ? <Music size={16} className="text-pink-400"/> : <Mic size={16} className="text-blue-400"/>}
                        <span className="text-sm font-bold uppercase tracking-wider">{audioSource}</span>
                        <RefreshCw size={14} className="text-gray-400 ml-1" />
                    </button>
                </div>

                {/* PIP Camera Feed & Overlay */}
                <div className="absolute top-4 right-4 z-40 flex flex-col items-end gap-2 pointer-events-auto">
                    <div className="relative w-[18rem] h-[13.5rem] bg-gray-900 rounded-lg overflow-hidden border-2 border-purple-500 shadow-xl">
                        {cameraError ? (
                            <div className="w-full h-full flex items-center justify-center text-xs text-red-400 p-2 text-center">
                                Camera Unavailable
                            </div>
                        ) : (
                            <>
                               {/* We clone the stream to show it here since main videoRef is used for processing */}
                               <CameraFeedDisplay srcObject={videoRef.current?.srcObject as MediaStream} />
                                <div className="absolute bottom-1 left-1 bg-black/50 px-2 py-0.5 rounded text-[10px] text-white flex items-center gap-1">
                                    <Camera size={10} /> Tracking Active
                                </div>
                            </>
                        )}
                    </div>
                    
                    {/* Legend */}
                    <div className="bg-black/60 backdrop-blur-md p-3 rounded-lg border border-white/10 text-xs text-gray-200">
                        <div className="flex items-center gap-2 mb-1">
                            <div className="w-2 h-2 rounded-full bg-yellow-400"></div> Fist: Jump
                        </div>
                        <div className="flex items-center gap-2 mb-1">
                            <div className="w-2 h-2 rounded-full bg-green-400"></div> Palm: Dance
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-cyan-400"></div> Peace: Spin
                        </div>
                    </div>
                </div>

                {/* Hand Position Indicator */}
                <div 
                    ref={handCursorRef}
                    className="absolute w-8 h-8 border-4 rounded-full z-50 transform -translate-x-1/2 -translate-y-1/2 transition-opacity duration-100 mix-blend-difference"
                    style={{ opacity: 0, top: '50%', left: '50%', borderColor: '#a855f7', boxShadow: '0 0 15px rgba(168,85,247,0.8)' }}
                />
            </div>
        </>
      )}

    </div>
  );
}

// Small helper to render the stream in PIP
const CameraFeedDisplay = ({ srcObject }: { srcObject: MediaStream | null }) => {
    const ref = useRef<HTMLVideoElement>(null);
    useEffect(() => {
        if(ref.current && srcObject) ref.current.srcObject = srcObject;
    }, [srcObject]);
    return <video ref={ref} autoPlay muted playsInline className="w-full h-full object-cover transform scale-x-[-1]" />;
};