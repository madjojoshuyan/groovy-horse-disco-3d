export enum Gesture {
  None = 'None',
  Closed_Fist = 'Closed_Fist',
  Open_Palm = 'Open_Palm',
  Victory = 'Victory'
}

export interface AudioAnalysis {
  beatDetected: boolean;
  volume: number; // 0-1
  frequencyData: Uint8Array;
}

export type AudioSourceType = 'mic' | 'file' | 'demo';
