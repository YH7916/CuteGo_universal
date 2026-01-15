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
      case 'worried': // "Original Style": Vertical stress lines + Grimace/Squiggly mouth
        return (
          <g>
            {/* Stress Lines (Vertical) */}
            <path d="M-10,-11 L-10,-5" stroke={featureColor} strokeWidth="2" strokeLinecap="round" />
            <path d="M-6,-13 L-6,-6" stroke={featureColor} strokeWidth="2" strokeLinecap="round" />
            <path d="M-2,-11 L-2,-5" stroke={featureColor} strokeWidth="2" strokeLinecap="round" />

            {/* Eyes (Small dots looking sideways) */}
            <circle cx="-5" cy="2" r="2" fill={featureColor} />
            <circle cx="5" cy="2" r="2" fill={featureColor} />
            
            {/* Mouth (Grimace / Wavy line) */}
            <path d="M-5,10 Q-2,7 0,10 Q2,13 5,10" fill="none" stroke={featureColor} strokeWidth="2" strokeLinecap="round" />
            
            {/* Big Sweat Drop */}
            <path d="M8,-5 Q12,-5 12,-2 Q12,1 8,1 Q6,1 6,-2 Q6,-5 8,-5" fill="#88ccff" stroke={featureColor} strokeWidth="0.5" />
          </g>
        );
      case 'neutral': // Angry/Determined
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
      case 'happy': // Clean cute face (No blush)
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
