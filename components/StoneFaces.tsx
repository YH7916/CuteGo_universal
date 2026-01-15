import React from 'react';

interface FaceProps {
  x: number;
  y: number;
  size: number;
  color: string;
  mood: 'happy' | 'neutral' | 'worried' | 'dead';
}

export const StoneFace: React.FC<FaceProps> = ({ x, y, size, color, mood }) => {
  const cx = x + size / 2;
  const cy = y + size / 2;
  const scale = size * 0.55; 

  const featureColor = color; 

  const getFaceContent = () => {
    switch (mood) {
      case 'dead': // X X
        return (
            <g>
             <path d="M-8,-3 L-3,3 M-3,-3 L-8,3" stroke={featureColor} strokeWidth="2.5" strokeLinecap="round" />
             <path d="M3,-3 L8,3 M8,-3 L3,3" stroke={featureColor} strokeWidth="2.5" strokeLinecap="round" />
             <path d="M-4,8 Q0,6 4,8" fill="none" stroke={featureColor} strokeWidth="2" strokeLinecap="round" />
            </g>
        );
      case 'worried': // Cute anxious: Tighter > < eyes with wavy mouth and teardrop sweat
        return (
          <g>
            {/* Eyes > < (Sharper angle: deeper indentation, smaller vertical spread) */}
            {/* Left Eye > */}
            <path d="M-9.5,-4.5 L-4.5,-1 L-9.5,2.5" stroke={featureColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            {/* Right Eye < */}
            <path d="M9.5,-4.5 L4.5,-1 L9.5,2.5" stroke={featureColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            
            {/* Mouth: Wavy ~ */}
            <path d="M-5,9 Q-2.5,6 0,9 Q2.5,12 5,9" fill="none" stroke={featureColor} strokeWidth="2" strokeLinecap="round" />

            {/* Sweat Drop - Proper Teardrop Shape */}
            <path 
              d="M12,-13 Q15,-9 15,-6 A3,3 0 1,1 9,-6 Q9,-9 12,-13 Z"
              fill="#5dade2" 
              stroke="#2e86c1" 
              strokeWidth="0.5" 
            />
          </g>
        );
      case 'neutral': // Determined / Serious
        return (
          <g>
            <circle cx="-6" cy="1" r="2.5" fill={featureColor} />
            <circle cx="6" cy="1" r="2.5" fill={featureColor} />
            {/* Eyebrows */}
            <path d="M-10,-6 L-3,-2" stroke={featureColor} strokeWidth="2.5" strokeLinecap="round" />
            <path d="M10,-6 L3,-2" stroke={featureColor} strokeWidth="2.5" strokeLinecap="round" />
            {/* Mouth */}
            <path d="M-3,9 Q0,7 3,9" fill="none" stroke={featureColor} strokeWidth="2" strokeLinecap="round" />
          </g>
        );
      case 'happy': // Default cute
      default:
        return (
          <g>
            {/* Eyes */}
            <circle cx="-6" cy="0" r="2.5" fill={featureColor} />
            <circle cx="6" cy="0" r="2.5" fill={featureColor} />
            
            {/* Mouth (w shape) */}
            <path d="M-5,5 Q-2.5,8 0,5 Q2.5,8 5,5" fill="none" stroke={featureColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
          </g>
        );
    }
  };

  return (
    <g transform={`translate(${cx}, ${cy}) scale(${scale / 24})`}>
      {getFaceContent()}
    </g>
  );
};
