import { AudioAnalysis } from '../types';

export class AudioService {
  private audioContext: AudioContext | null = null;
  private analyzer: AnalyserNode | null = null;
  private source: MediaStreamAudioSourceNode | MediaElementAudioSourceNode | null = null;
  private dataArray: Uint8Array | null = null;
  private audioElement: HTMLAudioElement | null = null;
  private stream: MediaStream | null = null;

  async initialize(sourceType: 'mic' | 'demo', demoUrl?: string): Promise<void> {
    // Cleanup previous source only
    this.cleanupSource();

    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    
    if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
    }

    // Reuse analyzer if exists, else create
    if (!this.analyzer) {
        this.analyzer = this.audioContext.createAnalyser();
        this.analyzer.fftSize = 256;
        this.dataArray = new Uint8Array(this.analyzer.frequencyBinCount);
    }

    if (sourceType === 'mic') {
      try {
        this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        this.source = this.audioContext.createMediaStreamSource(this.stream);
        this.source.connect(this.analyzer);
      } catch (e) {
        console.error("Mic access denied", e);
        throw e;
      }
    } else if (sourceType === 'demo' && demoUrl) {
      this.audioElement = new Audio(demoUrl);
      this.audioElement.crossOrigin = "anonymous";
      this.audioElement.loop = true;
      this.source = this.audioContext.createMediaElementSource(this.audioElement);
      this.source.connect(this.analyzer);
      this.source.connect(this.audioContext.destination);
      try {
          await this.audioElement.play();
      } catch (e) {
          console.error("Autoplay failed", e);
      }
    }
  }

  private cleanupSource() {
      if (this.source) {
          this.source.disconnect();
          this.source = null;
      }
      if (this.audioElement) {
          this.audioElement.pause();
          this.audioElement.src = "";
          this.audioElement = null;
      }
      if (this.stream) {
          this.stream.getTracks().forEach(track => track.stop());
          this.stream = null;
      }
  }

  getAnalysis(): AudioAnalysis {
    if (!this.analyzer || !this.dataArray) {
      return { beatDetected: false, volume: 0, frequencyData: new Uint8Array(0) };
    }

    this.analyzer.getByteFrequencyData(this.dataArray);

    // Simple beat detection logic (low frequency energy)
    // Bin 0-10 roughly covers bass in a 256 fft size with 44.1khz
    let bassEnergy = 0;
    for (let i = 0; i < 10; i++) {
      bassEnergy += this.dataArray[i];
    }
    const avgBass = bassEnergy / 10;
    const beatDetected = avgBass > 140; // Threshold

    // Calculate overall volume
    let sum = 0;
    for (let i = 0; i < this.dataArray.length; i++) {
        sum += this.dataArray[i];
    }
    const volume = sum / (this.dataArray.length * 255);

    return {
      beatDetected,
      volume,
      frequencyData: this.dataArray
    };
  }

  stop() {
    this.cleanupSource();
    this.audioContext?.close();
    this.audioContext = null;
    this.analyzer = null;
  }
}

export const audioService = new AudioService();