"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Point = { x: number; y: number };

/**
 * Captures strokes in the canvas's own coordinate space, so what gets hashed
 * does not depend on the device pixel ratio or how the element is laid out.
 */
export function SignaturePad({ documentId }: { documentId: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const strokesRef = useRef<Point[][]>([]);
  const drawingRef = useRef(false);

  const [signerId, setSignerId] = useState("rob@sploosh.ai");
  const [isEmpty, setIsEmpty] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const WIDTH = 400;
  const HEIGHT = 150;

  function pointFrom(event: React.PointerEvent<HTMLCanvasElement>): Point {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * WIDTH,
      y: ((event.clientY - rect.top) / rect.height) * HEIGHT,
    };
  }

  function start(event: React.PointerEvent<HTMLCanvasElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    drawingRef.current = true;
    strokesRef.current.push([pointFrom(event)]);
    setIsEmpty(false);
    setError(null);
  }

  function move(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    const point = pointFrom(event);
    const stroke = strokesRef.current.at(-1)!;
    stroke.push(point);

    const context = canvasRef.current!.getContext("2d")!;
    context.strokeStyle = "#14161c";
    context.lineWidth = 2.2;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.beginPath();
    const previous = stroke.at(-2) ?? point;
    context.moveTo(previous.x, previous.y);
    context.lineTo(point.x, point.y);
    context.stroke();
  }

  function end() {
    drawingRef.current = false;
  }

  function clear() {
    strokesRef.current = [];
    setIsEmpty(true);
    setError(null);
    const canvas = canvasRef.current!;
    canvas.getContext("2d")!.clearRect(0, 0, WIDTH, HEIGHT);
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/sign", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          documentId,
          signerId,
          drawnSignature: {
            width: WIDTH,
            height: HEIGHT,
            strokes: strokesRef.current,
          },
        }),
      });
      if (!response.ok) {
        const body = (await response.json()) as { error?: string };
        throw new Error(body.error ?? `Request failed (${response.status})`);
      }
      clear();
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <canvas
        ref={canvasRef}
        width={WIDTH}
        height={HEIGHT}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
      />
      <div className="row" style={{ marginTop: 12 }}>
        <input
          type="text"
          value={signerId}
          onChange={(event) => setSignerId(event.target.value)}
          aria-label="Signer"
          style={{ minWidth: 220 }}
        />
        <button
          className="primary"
          onClick={submit}
          disabled={isEmpty || busy || signerId.trim() === ""}
        >
          {busy ? "Signing..." : "Sign document"}
        </button>
        <button onClick={clear} disabled={isEmpty || busy}>
          Clear
        </button>
      </div>
      {error ? (
        <p className="mono" style={{ color: "var(--bad)" }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
