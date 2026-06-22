import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { FILTERS } from '../utils/filters';
import { FACE_FILTERS, drawFaceFilter } from '../utils/faceFilters';
import { getFaceLandmarker, releaseFaceLandmarker } from '../utils/faceTracking';
import { uploadChatImage, uploadChatVideo } from '../utils/cloudinary';
import { useFollowing, useGroups } from '../hooks/useChat';
import toast from 'react-hot-toast';

const MAX_VIDEO_SECONDS = 15;

export default function CameraPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const sendTarget = location.state?.sendTarget || null;

  const videoRef = useRef(null);
  const overlayCanvasRef = useRef(null); // live face-filter preview, sits on top of <video>
  const captureCanvasRef = useRef(null); // offscreen, used to bake the final photo/video frame
  const streamRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const recordTimerRef = useRef(null);
  const detectionLoopRef = useRef(null);
  const lastLandmarksRef = useRef(null);
  const faceFilterIdRef = useRef('none');

  const [facingMode, setFacingMode] = useState('user');
  const [activeFilter, setActiveFilter] = useState('none');
  const [activeFaceFilter, setActiveFaceFilter] = useState('none');
  const [filterTab, setFilterTab] = useState('color'); // 'color' | 'face'
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const [mode, setMode] = useState('photo');
  const [isRecording, setIsRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [capturedMedia, setCapturedMedia] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [showSendPicker, setShowSendPicker] = useState(false);
  const [faceModelStatus, setFaceModelStatus] = useState('idle'); // 'idle' | 'loading' | 'ready' | 'error'
  const [faceDetected, setFaceDetected] = useState(false);

  const currentFilterCss = FILTERS.find(f => f.id === activeFilter)?.css || 'none';

  useEffect(() => {
    faceFilterIdRef.current = activeFaceFilter;
  }, [activeFaceFilter]);

  // ── Camera stream setup ──
  const startCamera = useCallback(async () => {
    setCameraError(null);
    setCameraReady(false);
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode, width: { ideal: 1080 }, height: { ideal: 1920 } },
        audio: mode === 'video',
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraReady(true);
    } catch (err) {
      console.error('Camera error:', err);
      setCameraError(
        err.name === 'NotAllowedError'
          ? 'Camera permission denied. Please allow camera access in your browser settings.'
          : 'Could not access camera. Your device or browser may not support this.'
      );
    }
  }, [facingMode, mode]);

  useEffect(() => {
    startCamera();
    return () => {
      streamRef.current?.getTracks().forEach(t => t.stop());
      clearInterval(recordTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facingMode, mode]);

  // ── Lazy-load the face model only when the user opens the Face tab ──
  async function ensureFaceModelLoaded() {
    if (faceModelStatus === 'ready') return true;
    setFaceModelStatus('loading');
    try {
      await getFaceLandmarker();
      setFaceModelStatus('ready');
      return true;
    } catch (err) {
      console.error('Face model failed to load:', err);
      setFaceModelStatus('error');
      toast.error('Face filters could not load. Your connection or device may not support this.');
      return false;
    }
  }

  // ── Detection + overlay draw loop ──
  useEffect(() => {
    if (faceModelStatus !== 'ready' || !cameraReady) return;

    let cancelled = false;

    async function loop() {
      if (cancelled) return;
      const video = videoRef.current;
      const overlay = overlayCanvasRef.current;

      if (video && overlay && video.videoWidth > 0) {
        if (overlay.width !== video.videoWidth) overlay.width = video.videoWidth;
        if (overlay.height !== video.videoHeight) overlay.height = video.videoHeight;

        try {
          const landmarker = await getFaceLandmarker();
          const result = landmarker.detectForVideo(video, performance.now());
          const ctx = overlay.getContext('2d');
          ctx.clearRect(0, 0, overlay.width, overlay.height);

          if (result.faceLandmarks && result.faceLandmarks.length > 0) {
            lastLandmarksRef.current = result.faceLandmarks[0];
            setFaceDetected(true);

            ctx.save();
            if (facingMode === 'user') {
              ctx.translate(overlay.width, 0);
              ctx.scale(-1, 1);
            }
            drawFaceFilter(ctx, result.faceLandmarks[0], overlay.width, overlay.height, faceFilterIdRef.current);
            ctx.restore();
          } else {
            lastLandmarksRef.current = null;
            setFaceDetected(false);
          }
        } catch (err) {
          // Detection errors shouldn't crash the loop — just skip this frame
        }
      }

      detectionLoopRef.current = requestAnimationFrame(loop);
    }

    loop();
    return () => {
      cancelled = true;
      if (detectionLoopRef.current) cancelAnimationFrame(detectionLoopRef.current);
    };
  }, [faceModelStatus, cameraReady, facingMode]);

  // Clean up the face model when leaving the camera page entirely
  useEffect(() => {
    return () => releaseFaceLandmarker();
  }, []);

  function switchCamera() {
    setFacingMode(prev => (prev === 'user' ? 'environment' : 'user'));
  }

  async function handleFilterTabChange(tab) {
    setFilterTab(tab);
    if (tab === 'face' && faceModelStatus === 'idle') {
      await ensureFaceModelLoaded();
    }
  }

  // ── Capture photo: bakes color filter + face filter (if any) into one frame ──
  function capturePhoto() {
    const video = videoRef.current;
    const canvas = captureCanvasRef.current;
    if (!video || !canvas) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');

    ctx.filter = currentFilterCss;
    if (facingMode === 'user') {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    ctx.filter = 'none';

    // Bake in the face filter using the most recent landmarks
    if (activeFaceFilter !== 'none' && lastLandmarksRef.current) {
      drawFaceFilter(ctx, lastLandmarksRef.current, canvas.width, canvas.height, activeFaceFilter);
    }

    if (facingMode === 'user') {
      ctx.setTransform(1, 0, 0, 1, 0, 0); // reset mirroring before toBlob
    }

    canvas.toBlob((blob) => {
      const url = URL.createObjectURL(blob);
      setCapturedMedia({ type: 'image', blob, url });
    }, 'image/jpeg', 0.9);
  }

  // ── Video recording: composites video + overlay onto a hidden canvas,
  //    then records THAT canvas's stream so filters get baked into the video ──
  function startRecording() {
    if (!streamRef.current) return;
    recordedChunksRef.current = [];

    const video = videoRef.current;
    const canvas = captureCanvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');

    let rafId;
    function drawFrame() {
      ctx.save();
      ctx.filter = currentFilterCss;
      if (facingMode === 'user') {
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
      }
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      ctx.restore();
      ctx.filter = 'none';

      if (activeFaceFilter !== 'none' && lastLandmarksRef.current) {
        ctx.save();
        if (facingMode === 'user') {
          ctx.translate(canvas.width, 0);
          ctx.scale(-1, 1);
        }
        drawFaceFilter(ctx, lastLandmarksRef.current, canvas.width, canvas.height, activeFaceFilter);
        ctx.restore();
      }
      rafId = requestAnimationFrame(drawFrame);
    }
    drawFrame();

    const canvasStream = canvas.captureStream(30);
    // Pull the mic audio track from the real camera stream into the canvas stream
    const audioTracks = streamRef.current.getAudioTracks();
    audioTracks.forEach(track => canvasStream.addTrack(track));

    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
      ? 'video/webm;codecs=vp9'
      : 'video/webm';

    const recorder = new MediaRecorder(canvasStream, { mimeType });
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) recordedChunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      cancelAnimationFrame(rafId);
      const blob = new Blob(recordedChunksRef.current, { type: mimeType });
      const url = URL.createObjectURL(blob);
      setCapturedMedia({ type: 'video', blob, url });
    };

    mediaRecorderRef.current = recorder;
    recorder.start();
    setIsRecording(true);
    setRecordSeconds(0);

    recordTimerRef.current = setInterval(() => {
      setRecordSeconds(s => {
        if (s + 1 >= MAX_VIDEO_SECONDS) {
          stopRecording();
          return MAX_VIDEO_SECONDS;
        }
        return s + 1;
      });
    }, 1000);
  }

  function stopRecording() {
    clearInterval(recordTimerRef.current);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  }

  function handleShutterPress() {
    if (mode === 'photo') {
      capturePhoto();
    } else {
      isRecording ? stopRecording() : startRecording();
    }
  }

  function retake() {
    if (capturedMedia?.url) URL.revokeObjectURL(capturedMedia.url);
    setCapturedMedia(null);
    setRecordSeconds(0);
  }

  function handleClose() {
    streamRef.current?.getTracks().forEach(t => t.stop());
    navigate(-1);
  }

  async function handleSendTo(target) {
    if (!capturedMedia) return;
    setUploading(true);
    try {
      const url = capturedMedia.type === 'image'
        ? await uploadChatImage(capturedMedia.blob)
        : await uploadChatVideo(capturedMedia.blob);

      navigate('/', {
        state: {
          pendingMedia: {
            type: capturedMedia.type,
            url,
            targetType: target.type,
            targetId: target.id,
          },
        },
      });
    } catch (err) {
      console.error(err);
      toast.error('Failed to send. Please try again.');
    } finally {
      setUploading(false);
    }
  }

  function handleDownload() {
    if (!capturedMedia) return;
    const a = document.createElement('a');
    a.href = capturedMedia.url;
    a.download = `vartalap_${Date.now()}.${capturedMedia.type === 'image' ? 'jpg' : 'webm'}`;
    a.click();
    toast.success('Saved to downloads');
  }

  return (
    <div style={styles.container}>
      {!capturedMedia ? (
        <>
          {cameraError ? (
            <div style={styles.errorBox}>
              <p style={{ fontSize: 40, marginBottom: 12 }}>📷</p>
              <p style={{ marginBottom: 16 }}>{cameraError}</p>
              <button onClick={startCamera} style={styles.retryBtn}>Try again</button>
            </div>
          ) : (
            <>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                style={{
                  ...styles.video,
                  filter: currentFilterCss,
                  transform: facingMode === 'user' ? 'scaleX(-1)' : 'none',
                }}
              />
              <canvas ref={overlayCanvasRef} style={{ ...styles.video, pointerEvents: 'none' }} />
            </>
          )}
          <canvas ref={captureCanvasRef} style={{ display: 'none' }} />
        </>
      ) : (
        capturedMedia.type === 'image' ? (
          <img src={capturedMedia.url} alt="captured" style={styles.video} />
        ) : (
          <video src={capturedMedia.url} autoPlay loop playsInline style={styles.video} />
        )
      )}

      <div style={styles.topBar}>
        <button onClick={handleClose} style={styles.iconBtn}>✕</button>
        {!capturedMedia && !cameraError && (
          <button onClick={switchCamera} style={styles.iconBtn}>🔄</button>
        )}
      </div>

      {isRecording && (
        <div style={styles.recordingBadge}>
          ● REC {recordSeconds}s / {MAX_VIDEO_SECONDS}s
        </div>
      )}

      {filterTab === 'face' && faceModelStatus === 'loading' && !capturedMedia && (
        <div style={styles.modelLoadingBadge}>Loading face filters…</div>
      )}
      {filterTab === 'face' && faceModelStatus === 'ready' && !capturedMedia && (
        <div style={{
          ...styles.modelLoadingBadge,
          background: faceDetected ? 'rgba(124,92,252,0.85)' : 'rgba(0,0,0,0.45)',
        }}>
          {faceDetected ? '✓ Face detected' : 'Position your face in frame'}
        </div>
      )}

      {!capturedMedia && !cameraError && (
        <div style={styles.filterPanel}>
          <div style={styles.filterTabs}>
            <button
              onClick={() => handleFilterTabChange('color')}
              style={{ ...styles.filterTabBtn, ...(filterTab === 'color' ? styles.filterTabBtnActive : {}) }}
            >
              🎨 Color
            </button>
            <button
              onClick={() => handleFilterTabChange('face')}
              style={{ ...styles.filterTabBtn, ...(filterTab === 'face' ? styles.filterTabBtnActive : {}) }}
            >
              😎 Face
            </button>
          </div>

          <div style={styles.filterStrip}>
            {filterTab === 'color'
              ? FILTERS.map(f => (
                  <button
                    key={f.id}
                    onClick={() => setActiveFilter(f.id)}
                    style={{ ...styles.filterChip, ...(activeFilter === f.id ? styles.filterChipActive : {}) }}
                  >
                    {f.label}
                  </button>
                ))
              : FACE_FILTERS.map(f => (
                  <button
                    key={f.id}
                    onClick={() => setActiveFaceFilter(f.id)}
                    disabled={faceModelStatus !== 'ready'}
                    style={{
                      ...styles.filterChip,
                      ...(activeFaceFilter === f.id ? styles.filterChipActive : {}),
                      ...(faceModelStatus !== 'ready' ? { opacity: 0.5 } : {}),
                    }}
                  >
                    {f.label}
                  </button>
                ))
            }
          </div>
        </div>
      )}

      {!capturedMedia ? (
        <div style={styles.bottomBar}>
          <div style={styles.modeSwitch}>
            <button
              onClick={() => setMode('photo')}
              style={{ ...styles.modeBtn, ...(mode === 'photo' ? styles.modeBtnActive : {}) }}
            >
              PHOTO
            </button>
            <button
              onClick={() => setMode('video')}
              style={{ ...styles.modeBtn, ...(mode === 'video' ? styles.modeBtnActive : {}) }}
            >
              VIDEO
            </button>
          </div>

          <button
            onClick={handleShutterPress}
            disabled={!cameraReady}
            style={{
              ...styles.shutterBtn,
              ...(isRecording ? styles.shutterBtnRecording : {}),
            }}
          >
            <div style={{
              ...styles.shutterInner,
              ...(mode === 'video' ? { borderRadius: isRecording ? 6 : '50%', background: '#FF3B30' } : {}),
            }} />
          </button>
        </div>
      ) : (
        <div style={styles.previewActions}>
          <button onClick={retake} style={styles.secondaryBtn}>↺ Retake</button>
          <button onClick={handleDownload} style={styles.secondaryBtn}>⬇ Save</button>
          <button
            onClick={() => setShowSendPicker(true)}
            style={styles.sendBtnLarge}
            disabled={uploading}
          >
            {uploading ? 'Uploading…' : 'Send to… ➤'}
          </button>
        </div>
      )}

      {showSendPicker && (
        <SendPicker
          onClose={() => setShowSendPicker(false)}
          onPick={handleSendTo}
          uploading={uploading}
          presetTarget={sendTarget}
        />
      )}
    </div>
  );
}

function SendPicker({ onClose, onPick, uploading, presetTarget }) {
  const { contacts: users } = useFollowing();
  const { groups } = useGroups();

  useEffect(() => {
    if (presetTarget) {
      onPick(presetTarget);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (presetTarget) {
    return (
      <div style={styles.sendPickerOverlay}>
        <div style={{ color: '#fff', textAlign: 'center' }}>
          <div className="spinner" style={{ margin: '0 auto 12px', borderColor: 'rgba(255,255,255,0.3)', borderTopColor: '#fff' }} />
          Sending to {presetTarget.name}…
        </div>
      </div>
    );
  }

  return (
    <div style={styles.sendPickerOverlay}>
      <div style={styles.sendPickerSheet}>
        <div style={styles.sendPickerHeader}>
          <span style={{ fontWeight: 600, fontSize: 16 }}>Send to</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer' }}>✕</button>
        </div>
        <div style={{ maxHeight: 360, overflowY: 'auto' }}>
          {groups.length === 0 && users.length === 0 && (
            <div style={{ padding: '32px 24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
              You don't have any contacts yet. Follow someone from the chat list first.
            </div>
          )}
          {groups.map(g => (
            <div key={g.id} className="chat-item" onClick={() => !uploading && onPick({ type: 'group', id: g.id, name: g.name })} style={{ cursor: 'pointer' }}>
              <div className="chat-item-avatar">
                <div style={{ width: 46, height: 46, borderRadius: '50%', background: 'var(--teal-700)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>👥</div>
              </div>
              <div className="chat-item-content">
                <div className="chat-item-name">{g.name}</div>
              </div>
            </div>
          ))}
          {users.map(u => (
            <div key={u.uid} className="chat-item" onClick={() => !uploading && onPick({ type: 'user', id: u.uid, name: u.username })} style={{ cursor: 'pointer' }}>
              <div className="chat-item-avatar">
                {u.photoURL
                  ? <img src={u.photoURL} alt={u.username} />
                  : <div style={{ width: 46, height: 46, borderRadius: '50%', background: 'var(--teal-700)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>{(u.username || '?')[0].toUpperCase()}</div>}
              </div>
              <div className="chat-item-content">
                <div className="chat-item-name">{u.username}</div>
              </div>
            </div>
          ))}
        </div>
        {uploading && (
          <div style={{ textAlign: 'center', padding: 16, color: 'var(--text-secondary)', fontSize: 13 }}>
            Uploading…
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  container: {
    position: 'fixed', inset: 0, background: '#000',
    display: 'flex', flexDirection: 'column',
    overflow: 'hidden', zIndex: 1000,
  },
  video: {
    position: 'absolute', inset: 0,
    width: '100%', height: '100%',
    objectFit: 'cover',
  },
  topBar: {
    position: 'absolute', top: 0, left: 0, right: 0,
    display: 'flex', justifyContent: 'space-between',
    padding: '16px 16px', zIndex: 10,
  },
  iconBtn: {
    width: 42, height: 42, borderRadius: '50%',
    background: 'rgba(0,0,0,0.4)', border: 'none',
    color: '#fff', fontSize: 18, cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  recordingBadge: {
    position: 'absolute', top: 70, left: '50%', transform: 'translateX(-50%)',
    background: 'rgba(255,59,48,0.9)', color: '#fff',
    padding: '6px 14px', borderRadius: 20, fontSize: 13, fontWeight: 600,
    zIndex: 10,
  },
  modelLoadingBadge: {
    position: 'absolute', top: 70, left: '50%', transform: 'translateX(-50%)',
    background: 'rgba(0,0,0,0.5)', color: '#fff',
    padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 500,
    zIndex: 10, whiteSpace: 'nowrap',
  },
  filterPanel: {
    position: 'absolute', bottom: 140, left: 0, right: 0,
    zIndex: 10, display: 'flex', flexDirection: 'column', gap: 8,
  },
  filterTabs: {
    display: 'flex', gap: 8, padding: '0 16px',
  },
  filterTabBtn: {
    padding: '5px 14px', borderRadius: 16,
    background: 'rgba(0,0,0,0.35)', border: 'none',
    color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: 600, cursor: 'pointer',
  },
  filterTabBtnActive: {
    background: 'rgba(255,255,255,0.95)', color: '#000',
  },
  filterStrip: {
    display: 'flex', gap: 8, overflowX: 'auto',
    padding: '0 16px',
  },
  filterChip: {
    padding: '6px 14px', borderRadius: 20,
    background: 'rgba(0,0,0,0.45)', border: '1px solid rgba(255,255,255,0.3)',
    color: '#fff', fontSize: 12, fontWeight: 500, cursor: 'pointer',
    whiteSpace: 'nowrap', flexShrink: 0,
  },
  filterChipActive: {
    background: '#fff', color: '#000', border: '1px solid #fff',
  },
  bottomBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16,
    padding: '16px 16px 28px', zIndex: 10,
    background: 'linear-gradient(to top, rgba(0,0,0,0.5), transparent)',
  },
  modeSwitch: {
    display: 'flex', gap: 18,
  },
  modeBtn: {
    background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)',
    fontSize: 13, fontWeight: 700, letterSpacing: 1, cursor: 'pointer',
  },
  modeBtnActive: {
    color: '#fff',
  },
  shutterBtn: {
    width: 72, height: 72, borderRadius: '50%',
    border: '4px solid #fff', background: 'rgba(255,255,255,0.2)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer',
  },
  shutterBtnRecording: {
    border: '4px solid #FF3B30',
  },
  shutterInner: {
    width: 56, height: 56, borderRadius: '50%', background: '#fff',
  },
  errorBox: {
    flex: 1, display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center',
    color: '#fff', textAlign: 'center', padding: 30,
  },
  retryBtn: {
    padding: '10px 24px', borderRadius: 8, border: 'none',
    background: 'var(--teal-700)', color: '#fff', fontSize: 14, cursor: 'pointer',
  },
  previewActions: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    gap: 10, padding: '16px 20px 28px', zIndex: 10,
    background: 'linear-gradient(to top, rgba(0,0,0,0.6), transparent)',
  },
  secondaryBtn: {
    padding: '10px 16px', borderRadius: 24,
    background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)',
    color: '#fff', fontSize: 13, cursor: 'pointer', flexShrink: 0,
  },
  sendBtnLarge: {
    flex: 1, padding: '12px 20px', borderRadius: 24,
    background: 'var(--teal-700)', border: 'none',
    color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer',
  },
  sendPickerOverlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
    display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    zIndex: 2000,
  },
  sendPickerSheet: {
    background: '#fff', width: '100%', maxWidth: 480,
    borderRadius: '16px 16px 0 0', maxHeight: '70vh',
    display: 'flex', flexDirection: 'column', overflow: 'hidden',
  },
  sendPickerHeader: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '16px 20px', borderBottom: '1px solid var(--border)',
  },
};
