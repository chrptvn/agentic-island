/**
 * VideoRecorder — captures frames from the game canvas into a WebM video
 * using the MediaRecorder API.
 *
 * An off-screen canvas at the target resolution receives cropped frames
 * from the game canvas each render tick. `captureStream()` feeds those
 * frames to a MediaRecorder.
 */

export interface Resolution {
  label: string;
  width: number;
  height: number;
  category: "desktop" | "mobile" | "square";
}

export const RESOLUTION_PRESETS: Resolution[] = [
  { label: "1080p Full HD", width: 1920, height: 1080, category: "desktop" },
  { label: "720p HD", width: 1280, height: 720, category: "desktop" },
  { label: "1440p", width: 2560, height: 1440, category: "desktop" },
  { label: "4K UHD", width: 3840, height: 2160, category: "desktop" },
  { label: "Vertical HD (9:16)", width: 1080, height: 1920, category: "mobile" },
  { label: "Instagram Post (4:5)", width: 1080, height: 1350, category: "mobile" },
  { label: "Square (1:1)", width: 1080, height: 1080, category: "square" },
];

export interface CropRect {
  /** Source X offset in game-canvas pixels */
  x: number;
  /** Source Y offset in game-canvas pixels */
  y: number;
  /** Source width in game-canvas pixels */
  width: number;
  /** Source height in game-canvas pixels */
  height: number;
}

/**
 * Compute the crop rectangle (in game-canvas pixel space) that is centered
 * on the canvas and matches the given aspect ratio, fitting inside the canvas.
 */
export function computeCropRect(
  canvasWidth: number,
  canvasHeight: number,
  targetWidth: number,
  targetHeight: number,
): CropRect {
  const aspect = targetWidth / targetHeight;
  const canvasAspect = canvasWidth / canvasHeight;

  let cropW: number;
  let cropH: number;

  if (aspect > canvasAspect) {
    // Target is wider than canvas — fit width, letterbox height
    cropW = canvasWidth;
    cropH = canvasWidth / aspect;
  } else {
    // Target is taller than canvas — fit height, pillarbox width
    cropH = canvasHeight;
    cropW = canvasHeight * aspect;
  }

  return {
    x: (canvasWidth - cropW) / 2,
    y: (canvasHeight - cropH) / 2,
    width: cropW,
    height: cropH,
  };
}

/** Check whether MediaRecorder is available in the current browser. */
export function isRecordingSupported(): boolean {
  return (
    typeof MediaRecorder !== "undefined" &&
    typeof HTMLCanvasElement.prototype.captureStream === "function"
  );
}

export class VideoRecorder {
  private recCanvas: HTMLCanvasElement;
  private recCtx: CanvasRenderingContext2D;
  private recorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private chunks: Blob[] = [];
  private _isRecording = false;
  private startTime = 0;
  private resolution: Resolution;
  private crop: CropRect;
  private sourceCanvas: HTMLCanvasElement | null = null;
  private overlayCanvas: HTMLCanvasElement | null = null;

  get isRecording(): boolean {
    return this._isRecording;
  }

  /** Elapsed recording time in milliseconds. */
  get elapsed(): number {
    if (!this._isRecording) return 0;
    return performance.now() - this.startTime;
  }

  constructor(resolution: Resolution, crop: CropRect) {
    this.resolution = resolution;
    this.crop = crop;

    this.recCanvas = document.createElement("canvas");
    this.recCanvas.width = resolution.width;
    this.recCanvas.height = resolution.height;

    const ctx = this.recCanvas.getContext("2d");
    if (!ctx) throw new Error("Failed to create recording canvas context");
    ctx.imageSmoothingEnabled = false;
    this.recCtx = ctx;
  }

  /**
   * Start recording. The source canvas is the game canvas whose frames
   * will be captured via `renderFrame()`.
   */
  start(sourceCanvas: HTMLCanvasElement): void {
    if (this._isRecording) return;
    this.sourceCanvas = sourceCanvas;
    this.chunks = [];

    // 30 fps auto-capture — the stream continuously samples the recording
    // canvas so every drawImage from renderFrame() is picked up without
    // needing the less-portable requestFrame() API.
    this.stream = this.recCanvas.captureStream(30);

    // Choose the best supported codec
    const mimeType = this.pickMimeType();

    this.recorder = new MediaRecorder(this.stream, {
      mimeType,
      videoBitsPerSecond: 8_000_000,
    });

    this.recorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };

    this.recorder.start(100); // request data every 100ms
    this._isRecording = true;
    this.startTime = performance.now();
  }

  /**
   * Render the current game frame into the recording canvas. Call this
   * from the game renderer's `onFrame` callback while recording.
   */
  renderFrame(): void {
    if (!this._isRecording || !this.sourceCanvas) return;

    const { x, y, width, height } = this.crop;
    const { width: dw, height: dh } = this.resolution;

    this.recCtx.clearRect(0, 0, dw, dh);
    this.recCtx.drawImage(
      this.sourceCanvas,
      x, y, width, height, // source crop
      0, 0, dw, dh,        // destination (full recording canvas)
    );

    // Composite speech-bubble overlay on top with smoothing for crisp text
    if (this.overlayCanvas && this.overlayCanvas.width > 0) {
      this.recCtx.imageSmoothingEnabled = true;
      this.recCtx.imageSmoothingQuality = "high";
      this.recCtx.drawImage(
        this.overlayCanvas,
        x * (this.overlayCanvas.width / this.sourceCanvas.width),
        y * (this.overlayCanvas.height / this.sourceCanvas.height),
        width * (this.overlayCanvas.width / this.sourceCanvas.width),
        height * (this.overlayCanvas.height / this.sourceCanvas.height),
        0, 0, dw, dh,
      );
      this.recCtx.imageSmoothingEnabled = false;
    }
  }

  /**
   * Stop recording and return the assembled video Blob.
   */
  stop(): Promise<Blob> {
    return new Promise((resolve, reject) => {
      if (!this.recorder || !this._isRecording) {
        reject(new Error("Not recording"));
        return;
      }

      this.recorder.onstop = () => {
        const mimeType = this.recorder?.mimeType ?? "video/webm";
        const blob = new Blob(this.chunks, { type: mimeType });
        this.cleanup();
        resolve(blob);
      };

      this.recorder.onerror = (e) => {
        this.cleanup();
        reject(e);
      };

      this.recorder.stop();
    });
  }

  /** Set the overlay canvas (speech bubbles) to composite on top of game frames. */
  setOverlayCanvas(canvas: HTMLCanvasElement | null): void {
    this.overlayCanvas = canvas;
  }

  /** Update the crop rectangle (e.g. if user repositions). */
  setCrop(crop: CropRect): void {
    this.crop = crop;
  }

  /** Release resources. */
  destroy(): void {
    this.cleanup();
  }

  private cleanup(): void {
    this._isRecording = false;
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    this.recorder = null;
    this.sourceCanvas = null;
    this.overlayCanvas = null;
    this.chunks = [];
  }

  private pickMimeType(): string {
    const codecs = [
      "video/webm;codecs=vp9",
      "video/webm;codecs=vp8",
      "video/webm",
      "video/mp4",
    ];
    for (const codec of codecs) {
      if (MediaRecorder.isTypeSupported(codec)) return codec;
    }
    return "";
  }
}
