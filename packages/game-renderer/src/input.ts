/**
 * InputHandler — unified pointer/wheel/touch input for the game viewer.
 *
 * Uses the Pointer Events API so a single code path handles mouse and
 * single-finger touch.  Two-finger pinch is handled via the native
 * `wheel` event (trackpad) plus manual touch-distance tracking.
 */

import type { Camera } from "./camera.js";

const ZOOM_WHEEL_FACTOR = 1.1;

export interface InputHandlerOptions {
  camera: Camera;
  /** Called after every input-driven camera change so the host can request a re-render. */
  onChange?: () => void;
}

export class InputHandler {
  private camera: Camera;
  private canvas: HTMLCanvasElement | null = null;
  private onChange: (() => void) | undefined;

  // Drag state
  private dragging = false;
  private lastPointerX = 0;
  private lastPointerY = 0;

  // Pinch state (touch only)
  private activeTouches = new Map<number, { x: number; y: number }>();
  private lastPinchDist = 0;

  // Bound handlers (so we can removeEventListener with the same reference)
  private onPointerDown: (e: PointerEvent) => void;
  private onPointerMove: (e: PointerEvent) => void;
  private onPointerUp: (e: PointerEvent) => void;
  private onWheel: (e: WheelEvent) => void;
  private onTouchStart: (e: TouchEvent) => void;
  private onTouchMove: (e: TouchEvent) => void;
  private onTouchEnd: (e: TouchEvent) => void;
  private onContextMenu: (e: Event) => void;

  constructor(options: InputHandlerOptions) {
    this.camera = options.camera;
    this.onChange = options.onChange;

    this.onPointerDown = this.handlePointerDown.bind(this);
    this.onPointerMove = this.handlePointerMove.bind(this);
    this.onPointerUp = this.handlePointerUp.bind(this);
    this.onWheel = this.handleWheel.bind(this);
    this.onTouchStart = this.handleTouchStart.bind(this);
    this.onTouchMove = this.handleTouchMove.bind(this);
    this.onTouchEnd = this.handleTouchEnd.bind(this);
    this.onContextMenu = (e: Event) => e.preventDefault();
  }

  /** Start listening for input on the given canvas. */
  attach(canvas: HTMLCanvasElement): void {
    this.detach();
    this.canvas = canvas;

    canvas.addEventListener("pointerdown", this.onPointerDown);
    canvas.addEventListener("pointermove", this.onPointerMove);
    canvas.addEventListener("pointerup", this.onPointerUp);
    canvas.addEventListener("pointercancel", this.onPointerUp);
    canvas.addEventListener("wheel", this.onWheel, { passive: false });
    canvas.addEventListener("touchstart", this.onTouchStart, { passive: false });
    canvas.addEventListener("touchmove", this.onTouchMove, { passive: false });
    canvas.addEventListener("touchend", this.onTouchEnd);
    canvas.addEventListener("touchcancel", this.onTouchEnd);
    canvas.addEventListener("contextmenu", this.onContextMenu);

    canvas.style.cursor = "grab";
  }

  /** Stop listening and clean up. */
  detach(): void {
    const c = this.canvas;
    if (!c) return;

    c.removeEventListener("pointerdown", this.onPointerDown);
    c.removeEventListener("pointermove", this.onPointerMove);
    c.removeEventListener("pointerup", this.onPointerUp);
    c.removeEventListener("pointercancel", this.onPointerUp);
    c.removeEventListener("wheel", this.onWheel);
    c.removeEventListener("touchstart", this.onTouchStart);
    c.removeEventListener("touchmove", this.onTouchMove);
    c.removeEventListener("touchend", this.onTouchEnd);
    c.removeEventListener("touchcancel", this.onTouchEnd);
    c.removeEventListener("contextmenu", this.onContextMenu);

    c.style.cursor = "";
    this.canvas = null;
    this.dragging = false;
    this.activeTouches.clear();
  }

  // ── Pointer (mouse + single-touch) ─────────────────────────────────

  private handlePointerDown(e: PointerEvent): void {
    // Only start drag for primary button (left click / single finger)
    if (e.button !== 0) return;
    // Skip drag when two or more touches are active (pinch gesture)
    if (this.activeTouches.size >= 2) return;

    this.dragging = true;
    this.lastPointerX = e.clientX;
    this.lastPointerY = e.clientY;
    this.canvas!.setPointerCapture(e.pointerId);
    this.canvas!.style.cursor = "grabbing";
  }

  private handlePointerMove(e: PointerEvent): void {
    if (!this.dragging) return;
    // Don't pan while pinching
    if (this.activeTouches.size >= 2) return;

    const dx = e.clientX - this.lastPointerX;
    const dy = e.clientY - this.lastPointerY;
    this.lastPointerX = e.clientX;
    this.lastPointerY = e.clientY;

    // Convert CSS pixel delta to canvas buffer pixel delta so pan speed
    // matches the visual display regardless of CSS scaling.
    const rect = this.canvas!.getBoundingClientRect();
    const scaleX = this.canvas!.width / rect.width;
    const scaleY = this.canvas!.height / rect.height;
    this.camera.pan(dx * scaleX, dy * scaleY);
    this.onChange?.();
  }

  private handlePointerUp(e: PointerEvent): void {
    if (e.button !== 0 && e.type === "pointerup") return;
    this.dragging = false;
    if (this.canvas) this.canvas.style.cursor = "grab";
  }

  // ── Wheel (mouse scroll + trackpad pinch) ──────────────────────────

  private handleWheel(e: WheelEvent): void {
    e.preventDefault();
    const rect = this.canvas!.getBoundingClientRect();
    const scaleX = this.canvas!.width / rect.width;
    const scaleY = this.canvas!.height / rect.height;

    // Convert CSS pixel coords to canvas buffer pixel coords so the zoom
    // anchors at the correct world point regardless of CSS scaling.
    const screenX = (e.clientX - rect.left) * scaleX;
    const screenY = (e.clientY - rect.top) * scaleY;

    // deltaY > 0 = scroll down = zoom out
    const factor = e.deltaY < 0 ? ZOOM_WHEEL_FACTOR : 1 / ZOOM_WHEEL_FACTOR;
    this.camera.zoomAt(factor, screenX, screenY, this.canvas!.width, this.canvas!.height);
    this.onChange?.();
  }

  // ── Touch (pinch-to-zoom) ──────────────────────────────────────────

  private handleTouchStart(e: TouchEvent): void {
    // Prevent default to stop browser scroll/zoom
    e.preventDefault();
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i]!;
      this.activeTouches.set(t.identifier, { x: t.clientX, y: t.clientY });
    }
    if (this.activeTouches.size === 2) {
      this.lastPinchDist = this.getPinchDistance();
    }
  }

  private handleTouchMove(e: TouchEvent): void {
    e.preventDefault();
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i]!;
      this.activeTouches.set(t.identifier, { x: t.clientX, y: t.clientY });
    }

    if (this.activeTouches.size === 2) {
      const dist = this.getPinchDistance();
      if (this.lastPinchDist > 0) {
        const factor = dist / this.lastPinchDist;
        const mid = this.getPinchMidpoint();
        const rect = this.canvas!.getBoundingClientRect();
        const scaleX = this.canvas!.width / rect.width;
        const scaleY = this.canvas!.height / rect.height;
        this.camera.zoomAt(
          factor,
          (mid.x - rect.left) * scaleX,
          (mid.y - rect.top) * scaleY,
          this.canvas!.width,
          this.canvas!.height,
        );
        this.onChange?.();
      }
      this.lastPinchDist = dist;
    }
  }

  private handleTouchEnd(e: TouchEvent): void {
    for (let i = 0; i < e.changedTouches.length; i++) {
      this.activeTouches.delete(e.changedTouches[i]!.identifier);
    }
    if (this.activeTouches.size < 2) {
      this.lastPinchDist = 0;
    }
  }

  private getPinchDistance(): number {
    const pts = [...this.activeTouches.values()];
    if (pts.length < 2) return 0;
    const dx = pts[1]!.x - pts[0]!.x;
    const dy = pts[1]!.y - pts[0]!.y;
    return Math.hypot(dx, dy);
  }

  private getPinchMidpoint(): { x: number; y: number } {
    const pts = [...this.activeTouches.values()];
    return {
      x: (pts[0]!.x + pts[1]!.x) / 2,
      y: (pts[0]!.y + pts[1]!.y) / 2,
    };
  }
}
