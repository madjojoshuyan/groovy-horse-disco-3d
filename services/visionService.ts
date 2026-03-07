import { FilesetResolver, HandLandmarker, DrawingUtils } from "@mediapipe/tasks-vision";
import { Gesture } from "../types";

export class VisionService {
  private handLandmarker: HandLandmarker | undefined;
  private runningMode: "IMAGE" | "VIDEO" = "VIDEO";
  private lastVideoTime = -1;
  
  async initialize() {
    const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm"
    );
    
    this.handLandmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
        delegate: "GPU"
      },
      runningMode: this.runningMode,
      numHands: 1
    });
  }

  detect(video: HTMLVideoElement): { x: number, y: number, gesture: Gesture } | null {
    if (!this.handLandmarker) return null;

    const startTimeMs = performance.now();
    if (startTimeMs <= this.lastVideoTime) {
      return null;
    }
    this.lastVideoTime = startTimeMs;

    try {
      const result = this.handLandmarker.detectForVideo(video, startTimeMs);

      if (result.landmarks && result.landmarks.length > 0) {
      const landmarks = result.landmarks[0];
      
      // Calculate center of palm (approximate)
      // Wrist is 0, Index MCP is 5, Pinky MCP is 17
      const cx = (landmarks[0].x + landmarks[5].x + landmarks[17].x) / 3;
      const cy = (landmarks[0].y + landmarks[5].y + landmarks[17].y) / 3;

      // Gesture Classification Logic (Simplified)
      let gesture = Gesture.None;
      
      const thumbTip = landmarks[4];
      const indexTip = landmarks[8];
      const middleTip = landmarks[12];
      const ringTip = landmarks[16];
      const pinkyTip = landmarks[20];
      
      const thumbIp = landmarks[3];
      const indexPip = landmarks[6];
      const middlePip = landmarks[10];
      const ringPip = landmarks[14];
      const pinkyPip = landmarks[18];

      // Check if fingers are extended (tip above pip - y is inverted in screen space)
      // Actually y increases downwards. So extended means tip.y < pip.y
      
      const isIndexOpen = indexTip.y < indexPip.y;
      const isMiddleOpen = middleTip.y < middlePip.y;
      const isRingOpen = ringTip.y < ringPip.y;
      const isPinkyOpen = pinkyTip.y < pinkyPip.y;

      if (!isIndexOpen && !isMiddleOpen && !isRingOpen && !isPinkyOpen) {
        gesture = Gesture.Closed_Fist;
      } else if (isIndexOpen && isMiddleOpen && !isRingOpen && !isPinkyOpen) {
        gesture = Gesture.Victory;
      } else if (isIndexOpen && isMiddleOpen && isRingOpen && isPinkyOpen) {
        gesture = Gesture.Open_Palm;
      }

      return { x: cx, y: cy, gesture };
    }
    } catch (e) {
      console.error("Vision detection error:", e);
    }

    return null;
  }
}

export const visionService = new VisionService();
