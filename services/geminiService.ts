import { GoogleGenAI, Type } from "@google/genai";
import { Point, TrackData } from '../types';

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// Validation helper
const validatePoints = (pts: any[]): boolean => {
    if (!Array.isArray(pts)) return false;
    if (pts.length < 3) return false;
    return pts.every(p => p && typeof p.x === 'number' && typeof p.y === 'number');
};

export const getOptimizedRacingLine = async (track: TrackData): Promise<Point[]> => {
  if (!process.env.API_KEY) {
    console.error("API Key missing");
    throw new Error("API Key is missing. Please set the API_KEY environment variable.");
  }

  const prompt = `
    You are a professional racing line optimization algorithm.
    I will provide coordinates for the Outer and Inner boundaries of a race track.
    Your task is to generate the OPTIMAL RACING LINE (apex-hitting path) for this track.
    The path must stay strictly between the inner and outer boundaries.
    It should smooth out corners (maximize radius) to maintain high speed.
    
    Track Data:
    Outer Boundary: ${JSON.stringify(track.outer)}
    Inner Boundary: ${JSON.stringify(track.inner)}
    
    Return the result as a JSON array of objects with 'x' and 'y' coordinates. 
    Return exactly ${track.center.length} points corresponding to the segments of the track.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              x: { type: Type.NUMBER },
              y: { type: Type.NUMBER },
            },
            required: ["x", "y"],
          },
        },
      },
    });

    const jsonStr = response.text;
    if (!jsonStr) {
      throw new Error("No response text from Gemini");
    }
    
    const points: Point[] = JSON.parse(jsonStr);
    
    if (!validatePoints(points)) {
        console.warn("Gemini returned invalid points structure. Fallback to center.");
        return track.center;
    }

    return points;
  } catch (error) {
    console.error("Error calling Gemini:", error);
    // Fallback to center line if AI fails to prevent app crash
    return track.center;
  }
};

export const analyzeTrackStrategy = async (track: TrackData): Promise<string> => {
  if (!process.env.API_KEY) return "API Key missing.";

  const prompt = `
    Analyze this race track geometry and suggest vehicle setup adjustments for a time-attack racing game.
    Consider the corner tightness and straights based on these coordinates.
    Outer: ${JSON.stringify(track.outer)}
    Inner: ${JSON.stringify(track.inner)}
    
    Keep the advice concise, bulleted, and technical (e.g., downforce, gear ratios, suspension stiffness).
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });
    return response.text || "No analysis generated.";
  } catch (error) {
    console.error("Error analyzing track:", error);
    return "Failed to analyze track.";
  }
};

export const extractTrackFromImage = async (base64Image: string): Promise<TrackData> => {
  if (!process.env.API_KEY) throw new Error("API Key missing");

  // Remove data URL prefix if present to get pure base64
  const base64Data = base64Image.replace(/^data:image\/(png|jpeg|jpg);base64,/, '');

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: 'image/png',
              data: base64Data
            }
          },
          {
            text: `
              Analyze this image of a race track (top-down view).
              Identify the drivable track surface.
              
              I need you to approximate the track geometry into three arrays of coordinates (0-800 for x, 0-600 for y).
              1. 'outer': Points defining the outer edge of the track.
              2. 'inner': Points defining the inner island/hole of the track.
              3. 'center': Points defining the center line of the track.
              
              Ensure the 'outer' and 'inner' arrays form closed loops.
              Scale the coordinates to fit within an 800x600 canvas, maintaining aspect ratio.
              Ensure there are at least 15 points per array for smoothness.
            `
          }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            outer: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: { x: { type: Type.NUMBER }, y: { type: Type.NUMBER } },
                required: ["x", "y"]
              }
            },
            inner: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: { x: { type: Type.NUMBER }, y: { type: Type.NUMBER } },
                required: ["x", "y"]
              }
            },
            center: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: { x: { type: Type.NUMBER }, y: { type: Type.NUMBER } },
                required: ["x", "y"]
              }
            }
          },
          required: ["outer", "inner", "center"]
        }
      }
    });

    const result = JSON.parse(response.text || "{}");
    
    // Strict Validation
    if (!result.outer || !result.inner || !result.center) {
      throw new Error("Incomplete track data received");
    }
    
    if (!validatePoints(result.outer) || !validatePoints(result.inner) || !validatePoints(result.center)) {
        throw new Error("Track data contains invalid coordinates (non-numeric x/y)");
    }

    return result as TrackData;
  } catch (error) {
    console.error("Error extracting track from image:", error);
    throw error;
  }
};