import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import jsQR from "jsqr";
import { apiFetch } from "../api";

const SCAN_INTERVAL_MS = 350;

export default function Attendance() {
  const { eventId } = useParams();
  const [summary, setSummary] = useState(null);
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [scanEnabled, setScanEnabled] = useState(false);
  const [scanStatus, setScanStatus] = useState("");
  const [lastScan, setLastScan] = useState({ value: "", ts: 0 });
  const [scanMode, setScanMode] = useState("");
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const animationRef = useRef(null);
  const detectorRef = useRef(null);

  useEffect(() => {
    let active = true;

    const load = () => {
      apiFetch(`/attendance/summary?event_id=${eventId}`)
        .then((data) => {
          if (!active) return;
          setSummary(data);
        })
        .catch(() => {
          if (!active) return;
          setSummary(null);
        });
    };

    load();
    const timer = setInterval(load, 5000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [eventId]);

  useEffect(() => {
    return () => {
      stopScan();
    };
  }, []);

  const handleCheckIn = async (value) => {
    const ticketCode = value || code;
    if (!ticketCode) return;
    setMessage("");
    try {
      await apiFetch("/attendance/check-in", {
        method: "POST",
        body: JSON.stringify({ code: ticketCode })
      });
      setMessage("Checked in successfully.");
      setCode("");
    } catch (error) {
      setMessage("Check-in failed. Verify the ticket code.");
    }
  };

  const stopScan = () => {
    setScanEnabled(false);
    setScanMode("");
    detectorRef.current = null;
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  };

  const startScan = async () => {
    setMessage("");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" }
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      if ("BarcodeDetector" in window) {
        detectorRef.current = new BarcodeDetector({ formats: ["qr_code"] });
        setScanMode("native");
        setScanStatus("Point the camera at the ticket QR code.");
      } else {
        detectorRef.current = null;
        setScanMode("jsqr");
        setScanStatus("Using fallback scanner. Keep the code centered in the frame.");
      }

      setScanEnabled(true);
      scanLoop();
    } catch (error) {
      setScanStatus("Camera access denied or unavailable.");
      stopScan();
    }
  };

  const scanLoop = async () => {
    if (!videoRef.current || !scanEnabled) return;

    const now = Date.now();
    if (now - lastScan.ts < SCAN_INTERVAL_MS) {
      animationRef.current = requestAnimationFrame(scanLoop);
      return;
    }

    try {
      if (scanMode === "native" && detectorRef.current) {
        const barcodes = await detectorRef.current.detect(videoRef.current);
        if (barcodes.length) {
          const value = barcodes[0].rawValue;
          if (value && value !== lastScan.value) {
            setLastScan({ value, ts: now });
            setCode(value);
            await handleCheckIn(value);
          }
        }
      } else if (scanMode === "jsqr") {
        const canvas = canvasRef.current;
        const video = videoRef.current;
        if (canvas && video.readyState >= 2) {
          const width = video.videoWidth || 640;
          const height = video.videoHeight || 480;
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d", { willReadFrequently: true });
          ctx.drawImage(video, 0, 0, width, height);
          const imageData = ctx.getImageData(0, 0, width, height);
          const result = jsQR(imageData.data, width, height);
          if (result?.data && result.data !== lastScan.value) {
            setLastScan({ value: result.data, ts: now });
            setCode(result.data);
            await handleCheckIn(result.data);
          }
        }
      }
    } catch (error) {
      setScanStatus("Scanning error. Try again or use manual entry.");
    }

    animationRef.current = requestAnimationFrame(scanLoop);
  };

  return (
    <section className="page">
      <div className="page__header">
        <div>
          <h1>Attendance</h1>
          <p className="muted">Live counts update every 5 seconds.</p>
        </div>
      </div>

      <div className="attendance">
        <div className="card">
          <div className="card__body">
            <h3>Check-in</h3>
            <div className="scanner">
              <div className="scanner__video">
                <video ref={videoRef} muted playsInline />
                <canvas ref={canvasRef} className="scanner__canvas" />
                <div className="scanner__overlay" />
              </div>
              <div className="scanner__controls">
                {scanEnabled ? (
                  <button className="btn btn--ghost" type="button" onClick={stopScan}>
                    Stop camera scan
                  </button>
                ) : (
                  <button className="btn" type="button" onClick={startScan}>
                    Start camera scan
                  </button>
                )}
                <span className="muted">{scanStatus}</span>
              </div>
            </div>
            <label className="field">
              Ticket QR code
              <input value={code} onChange={(event) => setCode(event.target.value)} placeholder="Paste ticket code" />
            </label>
            <button className="btn" type="button" onClick={() => handleCheckIn()}>
              Confirm entry
            </button>
            {message ? <p className="muted">{message}</p> : null}
          </div>
        </div>

        <div className="card">
          <div className="card__body">
            <h3>Summary</h3>
            <p className="muted">Tickets issued: {summary?.tickets_issued ?? "--"}</p>
            <p className="muted">Checked in: {summary?.tickets_checked_in ?? "--"}</p>
          </div>
        </div>
      </div>
    </section>
  );
}