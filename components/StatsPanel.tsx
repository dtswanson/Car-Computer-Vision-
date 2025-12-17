import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { ChartDataPoint, SimulationState } from '../types';
import { Activity, Trophy, Timer, BrainCircuit } from 'lucide-react';

interface StatsPanelProps {
  simulationState: SimulationState;
  history: ChartDataPoint[];
  geminiAnalysis: string;
}

const StatsPanel: React.FC<StatsPanelProps> = ({ simulationState, history, geminiAnalysis }) => {
  return (
    <div className="h-full flex flex-col gap-4">
      
      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-slate-800 p-4 rounded-xl border border-slate-700">
          <div className="flex items-center gap-2 text-slate-400 mb-2">
            <Trophy size={16} />
            <span className="text-xs uppercase font-bold">Best Reward</span>
          </div>
          <div className="text-2xl font-mono text-emerald-400">
            {simulationState.bestReward.toFixed(2)}
          </div>
        </div>
        <div className="bg-slate-800 p-4 rounded-xl border border-slate-700">
          <div className="flex items-center gap-2 text-slate-400 mb-2">
            <Timer size={16} />
            <span className="text-xs uppercase font-bold">Lap Time</span>
          </div>
          <div className="text-2xl font-mono text-blue-400">
            {simulationState.bestLapTime === Infinity ? '--' : simulationState.bestLapTime.toFixed(3)}s
          </div>
        </div>
        <div className="bg-slate-800 p-4 rounded-xl border border-slate-700">
          <div className="flex items-center gap-2 text-slate-400 mb-2">
            <Activity size={16} />
            <span className="text-xs uppercase font-bold">Generation</span>
          </div>
          <div className="text-2xl font-mono text-white">
            {simulationState.generation}
          </div>
        </div>
         <div className="bg-slate-800 p-4 rounded-xl border border-slate-700">
          <div className="flex items-center gap-2 text-slate-400 mb-2">
            <BrainCircuit size={16} />
            <span className="text-xs uppercase font-bold">Agents</span>
          </div>
          <div className="text-2xl font-mono text-purple-400">
            {simulationState.agents.length}
          </div>
        </div>
      </div>

      {/* Graphs */}
      <div className="flex-1 bg-slate-800 p-4 rounded-xl border border-slate-700 min-h-[200px]">
        <h3 className="text-slate-400 text-xs font-bold uppercase mb-4">Mean Reward Over Time</h3>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={history}>
            <defs>
              <linearGradient id="colorReward" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis dataKey="generation" stroke="#64748b" fontSize={10} />
            <YAxis stroke="#64748b" fontSize={10} />
            <Tooltip 
              contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#fff' }}
              itemStyle={{ color: '#10b981' }}
            />
            <Area 
              type="monotone" 
              dataKey="reward" 
              stroke="#10b981" 
              fillOpacity={1} 
              fill="url(#colorReward)" 
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-slate-800 p-4 rounded-xl border border-slate-700">
        <h3 className="text-slate-400 text-xs font-bold uppercase mb-2 flex items-center gap-2">
           <BrainCircuit size={14} /> Gemini Analysis
        </h3>
        <div className="text-xs text-slate-300 font-mono whitespace-pre-line max-h-40 overflow-y-auto custom-scrollbar">
            {geminiAnalysis ? geminiAnalysis : "Waiting for track data..."}
        </div>
      </div>

    </div>
  );
};

export default StatsPanel;
