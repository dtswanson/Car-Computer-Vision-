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
      model: 'gemini-3-pro-preview',
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
      model: 'gemini-3-flash-preview',
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

  const base64Data = base64Image.replace(/^data:image\/(png|jpeg|jpg);base64,/, '');

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
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
              Analyze this image of a race track.
              Reconstruct the geometry into three arrays of coordinates (0-800 for x, 0-600 for y).
              1. 'outer': Points defining the outer edge.
              2. 'inner': Points defining the inner island.
              3. 'center': Points defining the center line.
              
              Ensure loops are closed and smooth.
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
    if (!result.outer || !result.inner || !result.center) throw new Error("Incomplete track data");
    return result as TrackData;
  } catch (error) {
    console.error("Error extracting track from image:", error);
    throw error;
  }
};

export const extractTrackFromCode = async (trackCode: string): Promise<TrackData> => {
  if (!process.env.API_KEY) throw new Error("API Key missing");

  const prompt = `
    You are an expert at reverse-engineering game map serialization strings. 
    This is a "PolyTrack" map code: 
    
    ${trackCode}
    
    This string contains the encoded tiles, rotations, and placement of a race track. 
    Interpret the logical shape represented by this code and output high-fidelity coordinate-based geometry for a 2D canvas (800x600).
    
    You must provide:
    1. 'outer': The closed loop boundary points of the track exterior.
    2. 'inner': The closed loop boundary points of the track interior (the "hole").
    3. 'center': The ideal center line of the drivable surface.
    
    Requirements:
    - Points should be in (x,y) format.
    - Coordinate range: x [0, 800], y [0, 600].
    - Ensure at least 30 points per array for high precision.
    - The track must be a continuous, valid circuit.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: prompt,
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
    if (!result.outer || !result.inner || !result.center) throw new Error("Failed to parse track code into geometry.");
    return result as TrackData;
  } catch (error) {
    console.error("Error decoding track code:", error);
    throw error;
  }
};