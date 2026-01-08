import React, { useState, useEffect, useCallback, useRef } from 'react';
import TrackCanvas from './components/TrackCanvas';
import StatsPanel from './components/StatsPanel';
import { INITIAL_TRACK, AGENT_COUNT } from './constants';
import { TrackData, SimulationState, Agent, Point, ChartDataPoint, SavedRun } from './types';
import { getOptimizedRacingLine, analyzeTrackStrategy, extractTrackFromImage, extractTrackFromCode } from './services/geminiService';
import { saveRun, getRunsForTrack, deleteRun, generateTrackSignature } from './services/storageService';
import { Play, Pause, Zap, Cpu, ScanEye, LayoutTemplate, Cast, MonitorPlay, Save, Database, Trash2, Ghost, Hash, X, Loader2 } from 'lucide-react';

// Helper to interpolate between two points
const lerp = (p1: Point, p2: Point, t: number): Point => {
  if (!p1 || !p2) return { x: 0, y: 0 };
  return {
    x: p1.x + (p2.x - p1.x) * t,
    y: p1.y + (p2.y - p1.y) * t,
  };
};

// Helper to get point on a path at t (0-1)
const getPointOnPath = (path: Point[], t: number): Point => {
  if (!path || path.length === 0) return { x: 400, y: 300 };
  
  const totalPoints = path.length;
  if (totalPoints === 1) return path[0];

  const scaledT = t * totalPoints;
  const index = Math.floor(scaledT) % totalPoints;
  const nextIndex = (index + 1) % totalPoints;
  const segmentT = scaledT - Math.floor(scaledT);
  
  const p1 = path[index];
  const p2 = path[nextIndex];

  if (!p1 || !p2) return path[0] || { x: 400, y: 300 };

  return lerp(p1, p2, segmentT);
};

export default function App() {
  const [track, setTrack] = useState<TrackData>(INITIAL_TRACK);
  const [targetPath, setTargetPath] = useState<Point[]>(INITIAL_TRACK.center); 
  const [optimalPath, setOptimalPath] = useState<Point[] | null>(null);
  
  const [history, setHistory] = useState<ChartDataPoint[]>([]);
  const [geminiAnalysis, setGeminiAnalysis] = useState<string>("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [isDecoding, setIsDecoding] = useState(false);
  
  const [showGame, setShowGame] = useState(true);
  const [showCodeInput, setShowCodeInput] = useState(false);
  const [trackCode, setTrackCode] = useState("");
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const [visionStream, setVisionStream] = useState<MediaStream | null>(null);
  const [, setTick] = useState(0);

  // Database State
  const [showDatabase, setShowDatabase] = useState(false);
  const [savedRuns, setSavedRuns] = useState<SavedRun[]>([]);
  const [ghostAgent, setGhostAgent] = useState<Agent | null>(null);

  const [simState, setSimState] = useState<SimulationState>({
    generation: 0,
    bestReward: 0,
    currentReward: 0,
    bestLapTime: Infinity,
    isRunning: false,
    agents: [],
  });

  const requestRef = useRef<number>(0);
  
  // Refresh saved runs when track changes
  useEffect(() => {
    setSavedRuns(getRunsForTrack(track));
  }, [track]);

  // Initialize Agents
  const initAgents = useCallback(() => {
    if (!track.center || track.center.length === 0) return;
    
    const startPoint = track.center[0];

    const newAgents: Agent[] = Array.from({ length: AGENT_COUNT }).map((_, i) => ({
      id: i,
      position: startPoint ? { ...startPoint } : { x: 400, y: 300 },
      path: (track.center && track.center.length > 0) 
        ? track.center.map(p => ({ 
            x: (p?.x || 0) + (Math.random() - 0.5) * 50, 
            y: (p?.y || 0) + (Math.random() - 0.5) * 50 
          }))
        : [{ x: 400, y: 300 }],
      color: `hsl(${Math.random() * 360}, 80%, 60%)`,
      progress: 0,
      speed: 0.005 + (Math.random() * 0.003), 
      crashed: false,
      angle: 0,
    }));
    
    setSimState(prev => ({
      ...prev,
      agents: newAgents,
      generation: 0,
      bestReward: 0,
      bestLapTime: Infinity
    }));
    setHistory([]);
  }, [track]);

  useEffect(() => {
    initAgents();
  }, [initAgents]);

  const handleSaveBestRun = () => {
    const path = optimalPath || (simState.agents.length > 0 ? simState.agents[0].path : track.center);
    
    const newRun: SavedRun = {
        id: Date.now().toString(),
        timestamp: Date.now(),
        name: `Gen ${simState.generation} - ${simState.bestLapTime < 999 ? simState.bestLapTime.toFixed(2) + 's' : 'In Progress'}`,
        generation: simState.generation,
        reward: simState.bestReward,
        lapTime: simState.bestLapTime,
        path: path,
        trackSignature: generateTrackSignature(track)
    };
    
    saveRun(newRun);
    setSavedRuns(getRunsForTrack(track));
  };

  const handleLoadRun = (run: SavedRun) => {
    setOptimalPath(run.path);
    setTargetPath(run.path);
    
    const startPoint = run.path[0];
    const ghost: Agent = {
        id: -1,
        position: startPoint,
        path: run.path,
        color: '#fbbf24', 
        progress: 0,
        speed: 0.008, 
        crashed: false,
        angle: 0
    };
    setGhostAgent(ghost);
  };

  const handleDeleteRun = (id: string) => {
      deleteRun(id);
      setSavedRuns(getRunsForTrack(track));
  };

  const handleLoadTrackCode = async () => {
      if (!trackCode.trim()) return;
      setIsDecoding(true);
      try {
          const newTrack = await extractTrackFromCode(trackCode);
          setTrack(newTrack);
          setTargetPath(newTrack.center);
          setOptimalPath(null);
          setGeminiAnalysis(`Track reconstructed from code [${trackCode.substring(0, 15)}...]`);
          setShowCodeInput(false);
          setTrackCode("");
          initAgents();
      } catch (e) {
          alert("Failed to decode track code. Ensure it is a valid PolyTrack string.");
      } finally {
          setIsDecoding(false);
      }
  };

  // Simulation Loop
  const updateSimulation = useCallback(() => {
    if (ghostAgent) {
        setGhostAgent(prev => {
            if (!prev) return null;
            let nextProgress = prev.progress + prev.speed;
            if (nextProgress >= 1) nextProgress = 0;
            
            const targetP = getPointOnPath(prev.path, nextProgress);
            const dx = targetP.x - prev.position.x;
            const dy = targetP.y - prev.position.y;
            const angle = Math.atan2(dy, dx);
            
            return {
                ...prev,
                progress: nextProgress,
                position: targetP,
                angle
            };
        });
    }

    setSimState(prev => {
      if (!prev.isRunning) return prev;

      let allFinished = true;
      const nextAgents = prev.agents.map(agent => {
        if (agent.crashed) return agent;
        
        let nextProgress = agent.progress + agent.speed;
        if (nextProgress >= 1) {
          nextProgress = 0;
        } else {
          allFinished = false;
        }

        const t = nextProgress;
        const targetP = getPointOnPath(targetPath, t);
        const learningFactor = Math.min(prev.generation * 0.001, 0.95); 
        
        const noiseX = (Math.random() - 0.5) * (20 * (1 - learningFactor));
        const noiseY = (Math.random() - 0.5) * (20 * (1 - learningFactor));

        const currentPos = agent.position || { x: 0, y: 0 };
        const lerpedPos = lerp(currentPos, targetP, 0.1);

        const newPos = {
            x: lerpedPos.x + noiseX,
            y: lerpedPos.y + noiseY
        };

        const dx = newPos.x - currentPos.x;
        const dy = newPos.y - currentPos.y;
        const angle = Math.atan2(dy, dx);

        return {
          ...agent,
          progress: nextProgress,
          position: newPos,
          angle: angle
        };
      });

      let nextGen = prev.generation;
      let nextHistory = history;
      let nextBestReward = prev.bestReward;
      let nextBestTime = prev.bestLapTime;

      const currentAvgReward = nextAgents.reduce((acc, a) => acc + (a.speed * 1000), 0) / nextAgents.length;
      
      if (Math.random() < 0.02) { 
        nextGen += 1;
        nextBestReward = Math.max(prev.bestReward, currentAvgReward + (nextGen * 0.5));
        nextHistory = [...history, { 
            generation: nextGen, 
            reward: currentAvgReward + (nextGen * 0.5),
            lapTime: 15 - (nextGen * 0.1) 
        }].slice(-50); 

        if (nextHistory.length > 0) {
            nextBestTime = Math.min(nextBestTime, 15 - (nextGen * 0.1));
        }
      }

      return {
        ...prev,
        agents: nextAgents,
        generation: nextGen,
        bestReward: nextBestReward,
        currentReward: currentAvgReward,
        bestLapTime: nextBestTime
      };
    });
    
    if (simState.isRunning || visionStream || ghostAgent) {
       setTick(t => t + 1);
    }
    setHistory(prev => prev);

    requestRef.current = requestAnimationFrame(updateSimulation);
  }, [targetPath, history, simState.isRunning, visionStream, ghostAgent]);

  useEffect(() => {
    requestRef.current = requestAnimationFrame(updateSimulation);
    return () => {
        if (requestRef.current) cancelAnimationFrame(requestRef.current);
    }
  }, [updateSimulation]);

  const handleConnectVision = async () => {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
          alert("Your browser does not support screen sharing.");
          return;
      }

      try {
          const stream = await navigator.mediaDevices.getDisplayMedia({
              video: true,
              audio: false
          });
          setVisionStream(stream);
          if (videoRef.current) {
              videoRef.current.srcObject = stream;
              videoRef.current.play();
          }
          
          stream.getVideoTracks()[0].onended = () => {
              handleStopVision();
          };

          setIsScanning(true);
          setTimeout(async () => {
              if (videoRef.current) {
                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = videoRef.current.videoWidth || 800;
                tempCanvas.height = videoRef.current.videoHeight || 600;
                const ctx = tempCanvas.getContext('2d');
                if (ctx) {
                    ctx.drawImage(videoRef.current, 0, 0, tempCanvas.width, tempCanvas.height);
                    const base64 = tempCanvas.toDataURL('image/png');
                    try {
                        const newTrack = await extractTrackFromImage(base64);
                        setTrack(newTrack);
                        setTargetPath(newTrack.center);
                        setOptimalPath(null);
                        setGeminiAnalysis("Track detected from live feed.");
                        initAgents();
                    } catch (e) {
                        console.error("Auto-scan failed", e);
                        setGeminiAnalysis("Could not detect track automatically. Please try pasting a screenshot.");
                    } finally {
                        setIsScanning(false);
                    }
                }
              }
          }, 2000);

      } catch (err: any) {
          console.error("Error connecting vision:", err);
          if (err.name === 'NotAllowedError' || err.message === 'Permission denied' || err.message === 'Permission denied by user') {
             console.log("User cancelled screen sharing.");
             return;
          }

          if (err.toString().includes("display-capture")) {
             alert("Screen sharing is blocked by the environment policy. Try opening this app in a new separate tab.");
          } else {
             alert(`Failed to connect screen share: ${err.message || 'Unknown error'}`);
          }
      }
  };

  const handleStopVision = () => {
      if (visionStream) {
          visionStream.getTracks().forEach(track => track.stop());
          setVisionStream(null);
          if (videoRef.current) {
              videoRef.current.srcObject = null;
          }
      }
  };

  const handleStartStop = () => {
    setSimState(prev => ({ ...prev, isRunning: !prev.isRunning }));
  };

  const handleGeminiOptimize = async () => {
    if (!process.env.API_KEY) {
        alert("Please provide an API Key in the code to use Gemini features.");
        return;
    }
    setIsAnalyzing(true);
    const analysis = await analyzeTrackStrategy(track);
    setGeminiAnalysis(analysis);
    const optimizedPoints = await getOptimizedRacingLine(track);
    setOptimalPath(optimizedPoints);
    setTargetPath(optimizedPoints);
    setIsAnalyzing(false);
  };

  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const blob = items[i].getAsFile();
          if (!blob) continue;

          setIsScanning(true);
          const reader = new FileReader();
          reader.onload = async (event) => {
            const base64 = event.target?.result as string;
            try {
              const newTrack = await extractTrackFromImage(base64);
              setTrack(newTrack);
              setTargetPath(newTrack.center);
              setOptimalPath(null); 
              setGeminiAnalysis("Track imported from screenshot.");
              initAgents(); 
            } catch (err) {
              console.error(err);
              alert("Failed to analyze track image.");
            } finally {
              setIsScanning(false);
            }
          };
          reader.readAsDataURL(blob);
          break;
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [initAgents]);

  return (
    <div className="flex h-screen w-full bg-slate-950 text-slate-200 overflow-hidden font-sans">
      
      <video ref={videoRef} className="hidden" muted playsInline />

      <div className={`${showGame ? 'w-1/2' : 'w-0'} bg-black transition-all duration-300 ease-in-out border-r border-slate-800 relative`}>
        <div className="absolute top-0 left-0 w-full h-full flex flex-col items-center justify-center text-slate-500 z-0">
          <p className="mb-2">Loading PolyTrack...</p>
          <p className="text-xs max-w-xs text-center">Paste track code or use "Connect Vision" to optimize.</p>
        </div>
        <iframe 
          src="https://kodub.com/apps/polytrack" 
          className="w-full h-full relative z-10"
          title="PolyTrack Game"
          sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
        />
      </div>

      <div className={`${showGame ? 'w-1/2' : 'w-full'} flex flex-col h-full transition-all duration-300 relative`}>
        
        <div className="h-16 border-b border-slate-800 flex items-center px-6 justify-between bg-slate-900 z-20 relative">
          <div className="flex items-center gap-4">
             <button 
                onClick={() => setShowGame(!showGame)}
                className="p-2 hover:bg-slate-800 rounded text-slate-400"
                title="Toggle Game View"
             >
                <LayoutTemplate size={20} />
             </button>
             
             <h1 className="font-bold bg-gradient-to-r from-emerald-400 to-blue-500 bg-clip-text text-transparent flex items-center gap-2">
                <Cpu size={20} className="text-emerald-400" />
                PolyTrack Optimizer
             </h1>
          </div>

          <div className="flex items-center gap-2">
             <button
                onClick={() => setShowCodeInput(!showCodeInput)}
                className={`flex items-center gap-2 px-3 py-2 text-sm font-bold rounded-lg transition-all border ${showCodeInput ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/50' : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'}`}
                title="Paste Track Code"
             >
                <Hash size={16} /> Code
             </button>

             <button
                onClick={() => setShowDatabase(!showDatabase)}
                className={`flex items-center gap-2 px-3 py-2 text-sm font-bold rounded-lg transition-all border ${showDatabase ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/50' : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'}`}
             >
                <Database size={16} /> Data
             </button>

             {visionStream ? (
                <button onClick={handleStopVision} className="flex items-center gap-2 px-3 py-2 bg-rose-500/10 text-rose-500 hover:bg-rose-500/20 text-sm font-bold rounded-lg border border-rose-500/50">
                    <Cast size={16} /> Stop Vision
                </button>
             ) : (
                <button onClick={handleConnectVision} className="flex items-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-bold rounded-lg border border-slate-700">
                    <MonitorPlay size={16} /> Vision
                </button>
             )}

            <button onClick={handleGeminiOptimize} disabled={isAnalyzing || isScanning || isDecoding} className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold rounded-lg disabled:opacity-50">
                {isAnalyzing ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} />} Optimize
            </button>
            <button onClick={handleStartStop} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${simState.isRunning ? 'bg-amber-500/10 text-amber-500' : 'bg-emerald-600 text-white'}`}>
                {simState.isRunning ? <Pause size={16} /> : <Play size={16} />}
                {simState.isRunning ? "Pause" : "Start"}
            </button>
          </div>
        </div>

        {/* Track Code Input Overlay */}
        {showCodeInput && (
            <div className="absolute top-16 left-0 right-0 p-6 bg-slate-900 border-b border-slate-800 z-40 shadow-xl flex flex-col gap-3 animate-in fade-in slide-in-from-top-4 duration-300">
                <div className="flex justify-between items-center">
                    <h3 className="text-sm font-bold text-slate-300 flex items-center gap-2"><Hash size={14} /> Import PolyTrack Code</h3>
                    <button onClick={() => setShowCodeInput(false)} className="p-1 hover:bg-slate-800 rounded text-slate-500"><X size={16} /></button>
                </div>
                <div className="flex gap-2">
                    <textarea 
                        value={trackCode}
                        onChange={(e) => setTrackCode(e.target.value)}
                        placeholder="Paste map data string here (starts with PolyTrack...)"
                        className="flex-1 bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs font-mono text-emerald-400 focus:outline-none focus:border-emerald-500/50 transition-colors h-24 resize-none"
                    />
                </div>
                <button 
                    onClick={handleLoadTrackCode}
                    disabled={isDecoding || !trackCode.trim()}
                    className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold rounded-lg flex items-center justify-center gap-2 text-sm"
                >
                    {isDecoding ? <Loader2 size={16} className="animate-spin" /> : <Database size={16} />}
                    {isDecoding ? "Decoding Map Data..." : "Load Map Geometry"}
                </button>
            </div>
        )}

        <div className={`absolute top-16 right-0 w-80 h-[calc(100%-4rem)] bg-slate-900 border-l border-slate-800 transform transition-transform duration-300 z-30 shadow-2xl ${showDatabase ? 'translate-x-0' : 'translate-x-full'}`}>
           <div className="p-4 border-b border-slate-800 flex justify-between items-center">
              <h3 className="font-bold flex items-center gap-2"><Database size={16} /> Saved Runs</h3>
              <button 
                 onClick={handleSaveBestRun}
                 className="p-2 bg-emerald-500/10 text-emerald-400 rounded hover:bg-emerald-500/20 text-xs font-bold flex items-center gap-1"
                 title="Save Current Best"
              >
                 <Save size={14} /> Save Current
              </button>
           </div>
           <div className="p-4 flex flex-col gap-2 overflow-y-auto h-full pb-20">
              {savedRuns.length === 0 ? (
                  <div className="text-slate-500 text-center py-10 text-sm">No saved runs for this track.</div>
              ) : (
                  savedRuns.map(run => (
                      <div key={run.id} className="bg-slate-800 p-3 rounded-lg border border-slate-700 hover:border-indigo-500/50 transition-colors group">
                          <div className="flex justify-between items-start mb-2">
                             <div>
                                 <div className="font-bold text-sm text-slate-200">{run.name}</div>
                                 <div className="text-[10px] text-slate-500">{new Date(run.timestamp).toLocaleTimeString()}</div>
                             </div>
                             <div className="text-right">
                                <div className="text-xs text-emerald-400">{run.lapTime < 999 ? run.lapTime.toFixed(2) + 's' : 'N/A'}</div>
                                <div className="text-[10px] text-slate-500">Gen {run.generation}</div>
                             </div>
                          </div>
                          <div className="flex gap-2 mt-2">
                             <button onClick={() => handleLoadRun(run)} className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs py-1.5 rounded flex items-center justify-center gap-1">
                                <Ghost size={12} /> Load Ghost
                             </button>
                             <button onClick={() => handleDeleteRun(run.id)} className="p-1.5 bg-slate-700 hover:bg-rose-500/20 hover:text-rose-500 text-slate-400 rounded transition-colors">
                                <Trash2 size={12} />
                             </button>
                          </div>
                      </div>
                  ))
              )}
           </div>
        </div>

        <div className="flex-1 flex flex-col p-6 gap-6 overflow-hidden relative">
          
          {(isScanning || isDecoding) && (
            <div className="absolute inset-0 z-50 bg-slate-950/80 backdrop-blur flex flex-col items-center justify-center">
                <div className="relative">
                    <ScanEye size={48} className="text-emerald-400 animate-pulse mb-4" />
                    <Loader2 size={64} className="text-emerald-500/30 animate-spin absolute inset-0 -m-2" />
                </div>
                <h3 className="text-xl font-bold text-white">{isScanning ? 'Scanning Feed...' : 'Reverse Engineering Code...'}</h3>
                <p className="text-slate-400">{isScanning ? 'Extracting geometry from pixels' : 'Gemini is interpreting map serialization'}</p>
            </div>
          )}

          <div className="flex-1 min-h-0 bg-slate-900/50 rounded-2xl border border-slate-800/50 relative flex items-center justify-center p-4">
            <TrackCanvas 
                track={track} 
                agents={simState.agents} 
                optimalPath={optimalPath}
                highlightedPath={simState.agents.length > 0 ? simState.agents[0].path : null}
                videoElement={videoRef.current}
                ghostAgent={ghostAgent}
            />
            <div className="absolute bottom-4 left-4 flex flex-col gap-2 text-[10px] text-slate-500 font-mono pointer-events-none bg-slate-900/80 p-2 rounded backdrop-blur">
                <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-emerald-500"></div> Optimal Line (AI)</div>
                <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-rose-500 opacity-50"></div> Current Best Policy</div>
                {ghostAgent && <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></div> Ghost Run (Database)</div>}
                {visionStream && <div className="text-emerald-400 mt-1 flex items-center gap-1"><Cast size={10} /> Live Vision Active</div>}
            </div>
          </div>

          <div className="h-64">
             <StatsPanel 
                simulationState={simState}
                history={history}
                geminiAnalysis={geminiAnalysis}
             />
          </div>
        </div>
      </div>
    </div>
  );
}
