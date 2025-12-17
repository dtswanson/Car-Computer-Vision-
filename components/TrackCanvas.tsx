
import React, { useRef, useEffect } from 'react';
import { TrackData, Agent, Point } from '../types';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '../constants';

interface TrackCanvasProps {
  track: TrackData;
  agents: Agent[];
  optimalPath: Point[] | null;
  highlightedPath: Point[] | null;
  videoElement: HTMLVideoElement | null;
  ghostAgent: Agent | null; // Add Ghost Agent prop
}

const TrackCanvas: React.FC<TrackCanvasProps> = ({ track, agents, optimalPath, highlightedPath, videoElement, ghostAgent }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const drawTrack = (ctx: CanvasRenderingContext2D) => {
    const isVideoActive = videoElement && !videoElement.paused && !videoElement.ended;

    // 1. Draw Background
    if (isVideoActive) {
       // Maintain aspect ratio cover
       const hRatio = CANVAS_WIDTH / videoElement.videoWidth;
       const vRatio = CANVAS_HEIGHT / videoElement.videoHeight;
       const ratio = Math.max(hRatio, vRatio);
       const centerShift_x = (CANVAS_WIDTH - videoElement.videoWidth * ratio) / 2;
       const centerShift_y = (CANVAS_HEIGHT - videoElement.videoHeight * ratio) / 2;
       
       ctx.drawImage(
         videoElement, 
         0, 0, videoElement.videoWidth, videoElement.videoHeight,
         centerShift_x, centerShift_y, videoElement.videoWidth * ratio, videoElement.videoHeight * ratio
       );
       
       // Darken slightly to make agents pop
       ctx.fillStyle = 'rgba(15, 23, 42, 0.6)';
       ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    } else {
       // Default Background
       ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
       ctx.fillStyle = '#1e293b';
       ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    }

    // 2. Configure Styles (Semi-transparent for AR mode)
    const asphaltStyle = isVideoActive ? 'rgba(51, 65, 85, 0.4)' : '#334155';
    const borderStyle = isVideoActive ? 'rgba(248, 250, 252, 0.4)' : '#f8fafc';
    const grassStyle = isVideoActive ? 'rgba(30, 41, 59, 0.0)' : '#1e293b'; // Invisible grass in AR

    // 3. Draw Track Geometry
    // Outer loop
    ctx.beginPath();
    track.outer.forEach((p, i) => {
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.closePath();
    
    ctx.fillStyle = asphaltStyle;
    ctx.fill();
    ctx.strokeStyle = borderStyle;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Inner Grass/Island
    ctx.beginPath();
    track.inner.forEach((p, i) => {
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.closePath();
    ctx.fillStyle = grassStyle; // Transparent in AR mode to see through hole
    if (!isVideoActive) {
        ctx.fill(); // Only fill grass if not in AR mode
    } else {
        ctx.fillStyle = 'rgba(0,0,0,0.5)'; // Darken the island slightly
        ctx.fill();
    }
    ctx.strokeStyle = borderStyle;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Draw Center Line (faint)
    ctx.beginPath();
    track.center.forEach((p, i) => {
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.closePath();
    ctx.strokeStyle = isVideoActive ? 'rgba(255, 255, 255, 0.2)' : 'rgba(255, 255, 255, 0.1)';
    ctx.setLineDash([5, 5]);
    ctx.stroke();
    ctx.setLineDash([]);
  };

  const drawPath = (ctx: CanvasRenderingContext2D, path: Point[], color: string, width: number, dashed = false) => {
    if (path.length < 2) return;
    ctx.beginPath();
    path.forEach((p, i) => {
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.lineTo(path[0].x, path[0].y);
    
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineJoin = 'round';
    if (dashed) ctx.setLineDash([10, 10]);
    else ctx.setLineDash([]);
    ctx.stroke();
    ctx.setLineDash([]);
  };

  const drawAgent = (ctx: CanvasRenderingContext2D, agent: Agent, isGhost = false) => {
      ctx.save();
      ctx.translate(agent.position.x, agent.position.y);
      ctx.rotate(agent.angle);
      
      // Draw Car Body
      if (isGhost) {
        // Glowing Ghost Effect
        ctx.shadowBlur = 15;
        ctx.shadowColor = '#fbbf24'; // Amber glow
        ctx.fillStyle = 'rgba(251, 191, 36, 0.8)';
        ctx.fillRect(-8, -4, 16, 8); // Slightly bigger
      } else {
        ctx.fillStyle = agent.color;
        ctx.fillRect(-6, -3, 12, 6);
      }
      
      // Headlights?
      ctx.fillStyle = isGhost ? '#ffffff' : '#fef3c7';
      ctx.fillRect(4, -2, 2, 1);
      ctx.fillRect(4, 1, 2, 1);
      
      ctx.restore();
  };

  const drawAgents = (ctx: CanvasRenderingContext2D) => {
    agents.forEach(agent => drawAgent(ctx, agent));
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    drawTrack(ctx);

    if (optimalPath) {
      drawPath(ctx, optimalPath, '#10b981', 3); 
    }

    if (highlightedPath) {
        drawPath(ctx, highlightedPath, 'rgba(244, 63, 94, 0.5)', 2); 
    }
    
    // Draw Ghost Path if active
    if (ghostAgent) {
        drawPath(ctx, ghostAgent.path, 'rgba(251, 191, 36, 0.4)', 2, true);
        drawAgent(ctx, ghostAgent, true);
    }

    drawAgents(ctx);

  }, [track, agents, optimalPath, highlightedPath, videoElement, ghostAgent]); 

  return (
    <div className="relative rounded-xl overflow-hidden shadow-2xl border border-slate-700 bg-slate-900 w-full h-full flex items-center justify-center">
      <canvas 
        ref={canvasRef} 
        width={CANVAS_WIDTH} 
        height={CANVAS_HEIGHT} 
        className="block max-w-full max-h-full object-contain"
      />
      
      <div className="absolute top-4 left-4 pointer-events-none flex flex-col gap-1">
        <h2 className="text-white/50 text-sm font-mono tracking-wider">
            {videoElement ? "LIVE_VISION_FEED" : "SIMULATION_VIEW"}
        </h2>
        {videoElement && <span className="text-[10px] text-emerald-400 font-mono animate-pulse">● REC</span>}
        {ghostAgent && <span className="text-[10px] text-amber-400 font-mono animate-pulse font-bold">● GHOST ACTIVE</span>}
      </div>
    </div>
  );
};

export default TrackCanvas;
