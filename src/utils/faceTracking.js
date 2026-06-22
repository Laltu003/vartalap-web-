// ============================================================
// src/utils/faceTracking.js
// Wraps MediaPipe's FaceLandmarker for real-time face tracking.
// Loads model + WASM runtime from Google's CDN on first use.
// ============================================================
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

const WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

let landmarkerInstance = null;
let loadingPromise = null;

/**
 * Lazily creates (or returns the cached) FaceLandmarker instance.
 * Only loads the ~3-5MB model once per session.
 */
export async function getFaceLandmarker() {
  if (landmarkerInstance) return landmarkerInstance;
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    const filesetResolver = await FilesetResolver.forVisionTasks(WASM_URL);
    landmarkerInstance = await FaceLandmarker.createFromOptions(filesetResolver, {
      baseOptions: {
        modelAssetPath: MODEL_URL,
        delegate: 'GPU',
      },
      outputFaceBlendshapes: false,
      outputFacialTransformationMatrixes: false,
      runningMode: 'VIDEO',
      numFaces: 1,
    });
    return landmarkerInstance;
  })();

  return loadingPromise;
}

/**
 * Key landmark indices we care about (MediaPipe's 468-point face mesh).
 * Reference: https://github.com/google/mediapipe/blob/master/docs/solutions/face_mesh.md
 */
export const LANDMARKS = {
  FOREHEAD_CENTER: 10,
  LEFT_EAR_TOP: 234,
  RIGHT_EAR_TOP: 454,
  LEFT_EYE_OUTER: 33,
  LEFT_EYE_INNER: 133,
  RIGHT_EYE_OUTER: 263,
  RIGHT_EYE_INNER: 362,
  NOSE_BRIDGE: 6,
  NOSE_TIP: 1,
  CHIN: 152,
  LEFT_FACE_EDGE: 234,
  RIGHT_FACE_EDGE: 454,
};

export function releaseFaceLandmarker() {
  if (landmarkerInstance) {
    landmarkerInstance.close();
    landmarkerInstance = null;
    loadingPromise = null;
  }
}
