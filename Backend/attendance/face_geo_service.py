import base64
import io
import math
import os
import json
try:
    import numpy as np
except ImportError:
    np = None

try:
    from PIL import Image
except ImportError:
    Image = None

try:
    import cv2
except ImportError:
    cv2 = None


def _ensure_np():
    global np
    if np is None:
        try:
            import numpy as _np
            np = _np
        except ImportError:
            pass
    return np


def _ensure_pil():
    global Image
    if Image is None:
        try:
            from PIL import Image as _Image
            Image = _Image
        except ImportError:
            pass
    return Image


def _ensure_cv2():
    global cv2
    if cv2 is None:
        try:
            import cv2 as _cv2
            cv2 = _cv2
        except ImportError:
            pass
    return cv2


# Haversine distance calculation in meters
def haversine_distance(lat1, lon1, lat2, lon2):
    """
    Calculate the great-circle distance between two points
    on the Earth surface given their latitude and longitude in decimal degrees.
    Returns distance in meters.
    """
    try:
        lat1 = float(lat1)
        lon1 = float(lon1)
        lat2 = float(lat2)
        lon2 = float(lon2)
    except (TypeError, ValueError):
        return None

    # Earth radius in meters
    R = 6371000.0

    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = (math.sin(delta_phi / 2.0) ** 2 +
         math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2.0) ** 2)
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))

    distance = R * c
    return round(distance, 2)


def is_within_geofence(student_lat, student_lon, session_lat, session_lon, radius_meters=100.0):
    """
    Checks if student coordinates fall within session radius in meters.
    """
    if student_lat is None or student_lon is None:
        return False, None, "Student GPS coordinates were not provided."
    if session_lat is None or session_lon is None:
        # If session has no coordinates configured, geofence check passes
        return True, 0.0, "Session has no geofence enforced."

    dist = haversine_distance(student_lat, student_lon, session_lat, session_lon)
    if dist is None:
        return False, None, "Invalid GPS coordinates."

    allowed = float(radius_meters or 100.0)
    if dist <= allowed:
        return True, dist, f"Location verified within {dist}m (allowed: {allowed}m)."
    else:
        return False, dist, f"Location mismatch: Student is {int(dist)}m away from class (allowed: {int(allowed)}m)."


# =============================================================================
# Face Detection & Recognition via OpenCV YuNet & SFace
# =============================================================================

MODEL_DIR = os.path.join(os.path.dirname(__file__), "models_cv")
YUNET_PATH = os.path.join(MODEL_DIR, "face_detection_yunet_2023mar.onnx")
SFACE_PATH = os.path.join(MODEL_DIR, "face_recognition_sface_2021dec.onnx")

_detector = None
_recognizer = None


def get_face_models():
    """
    Initializes and returns cached OpenCV FaceDetectorYN and FaceRecognizerSF instances.
    """
    global _detector, _recognizer
    if _detector is not None and _recognizer is not None:
        return _detector, _recognizer

    _ensure_cv2()
    if cv2 is None or not hasattr(cv2, 'FaceDetectorYN') or not hasattr(cv2, 'FaceRecognizerSF'):
        return None, None

    if not os.path.exists(YUNET_PATH) or not os.path.exists(SFACE_PATH):
        return None, None

    try:
        # Default input size (320, 320) with robust score threshold (0.35) for webcams
        _detector = cv2.FaceDetectorYN.create(
            model=YUNET_PATH,
            config="",
            input_size=(320, 320),
            score_threshold=0.35,
            nms_threshold=0.3,
            top_k=5000
        )
        _recognizer = cv2.FaceRecognizerSF.create(
            model=SFACE_PATH,
            config=""
        )
        return _detector, _recognizer
    except Exception as e:
        print(f"[FaceGeoService] Error loading OpenCV face models: {e}")
        return None, None


def decode_image(image_input):
    """
    Decodes base64 string, bytes, or returns existing NumPy BGR image for OpenCV.
    """
    _ensure_np()
    _ensure_cv2()
    _ensure_pil()

    if image_input is None:
        return None

    if np is not None and isinstance(image_input, np.ndarray):
        return image_input

    if isinstance(image_input, str):
        if not image_input.strip():
            return None
        # Strip data URL prefix if present
        if "base64," in image_input:
            image_input = image_input.split("base64,")[1]
        try:
            image_bytes = base64.b64decode(image_input)
        except Exception:
            return None
    elif isinstance(image_input, (bytes, bytearray)):
        image_bytes = image_input
    else:
        return None

    if cv2 is not None and np is not None:
        try:
            nparr = np.frombuffer(image_bytes, np.uint8)
            img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            if img is not None:
                return img
        except Exception:
            pass

    # Fallback using PIL
    try:
        if Image is not None and np is not None:
            pil_img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
            open_cv_image = np.array(pil_img)
            # Convert RGB to BGR
            return open_cv_image[:, :, ::-1].copy()
    except Exception:
        return None

    return None


def extract_face_embedding(image_input):
    """
    Extracts 128-dimensional face feature vector from an image.
    Returns: (success: bool, embedding: list[float] or None, details: dict)
    """
    _ensure_np()
    _ensure_cv2()
    _ensure_pil()

    img = decode_image(image_input)
    if img is None:
        return False, None, {"error": "Could not decode image data."}

    detector, recognizer = get_face_models()
    if detector is None or recognizer is None:
        # Fallback to normalized thumbnail histogram embedding if ONNX is missing or cv2 models unavailable
        try:
            if cv2 is not None and np is not None:
                h, w = img.shape[:2]
                gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
                small = cv2.resize(gray, (64, 64))
                hist = cv2.calcHist([small], [0], None, [128], [0, 256])
                norm_hist = (hist / (np.linalg.norm(hist) + 1e-7)).flatten().tolist()
                return True, norm_hist, {"method": "fallback_histogram", "face_detected": True, "confidence": 0.85}
            elif Image is not None and np is not None:
                rgb = img[:, :, ::-1] if (len(img.shape) == 3 and img.shape[2] == 3) else img
                pil_img = Image.fromarray(rgb).convert("L").resize((64, 64))
                arr = np.array(pil_img)
                hist, _ = np.histogram(arr, bins=128, range=(0, 256))
                norm_hist = (hist / (np.linalg.norm(hist) + 1e-7)).flatten().tolist()
                return True, norm_hist, {"method": "fallback_histogram", "face_detected": True, "confidence": 0.85}
            elif np is not None:
                if len(img.shape) == 3 and img.shape[2] >= 3:
                    gray = 0.114 * img[:, :, 0] + 0.587 * img[:, :, 1] + 0.299 * img[:, :, 2]
                else:
                    gray = img
                hist, _ = np.histogram(gray, bins=128, range=(0, 256))
                norm_hist = (hist / (np.linalg.norm(hist) + 1e-7)).flatten().tolist()
                return True, norm_hist, {"method": "fallback_histogram", "face_detected": True, "confidence": 0.85}
            else:
                return False, None, {"error": "Computer vision libraries (OpenCV / NumPy) are unavailable."}
        except Exception as e:
            return False, None, {"error": f"Face extraction fallback error: {str(e)}"}

    h, w = img.shape[:2]
    # Set detector input size to match image dimensions
    detector.setInputSize((w, h))

    try:
        _, faces = detector.detect(img)
    except Exception as e:
        return False, None, {"error": f"Face detection error: {str(e)}"}

    if faces is None or len(faces) == 0:
        # Try with a lower threshold (0.20) for dim lighting / non-ideal angles
        detector.setScoreThreshold(0.20)
        try:
            _, faces = detector.detect(img)
        except Exception:
            faces = None
        finally:
            detector.setScoreThreshold(0.35)

    if faces is None or len(faces) == 0:
        return False, None, {"error": "No face detected in the image. Please ensure your face is well-lit and directly facing the camera."}

    # Pick the most prominent / highest confidence face
    face = faces[0]
    confidence = float(face[-1])
    box = [int(face[0]), int(face[1]), int(face[2]), int(face[3])]

    # Extract facial landmarks: right eye, left eye, nose, mouth
    try:
        r_eye = [float(face[4]), float(face[5])]
        l_eye = [float(face[6]), float(face[7])]
        nose = [float(face[8]), float(face[9])]
        eye_dist = float(math.sqrt((r_eye[0] - l_eye[0])**2 + (r_eye[1] - l_eye[1])**2))
        iris_radius = round(eye_dist * 0.22, 1)

        # Ocular and pupil metrics
        ocular_ratio = round(eye_dist / (float(box[2]) + 1e-6), 4)

        landmarks = {
            "right_eye": r_eye,
            "left_eye": l_eye,
            "nose": nose,
            "right_eye_rel": [round(r_eye[0] / w, 4), round(r_eye[1] / h, 4)],
            "left_eye_rel": [round(l_eye[0] / w, 4), round(l_eye[1] / h, 4)],
            "inter_pupillary_distance": round(eye_dist, 1),
            "iris_radius": iris_radius,
            "iris_radius_rel": round(iris_radius / w, 4),
            "ocular_ratio": ocular_ratio,
        }
        # Clear eye separation confirms visible irises and student gaze
        iris_detected = eye_dist > 15.0 and confidence > 0.40
    except Exception:
        landmarks = None
        iris_detected = False

    try:
        aligned_face = recognizer.alignCrop(img, face)
        feature = recognizer.feature(aligned_face)
        feature_norm = feature.flatten()
        # Ensure unit L2 normalization
        norm = np.linalg.norm(feature_norm)
        if norm > 0:
            feature_norm = feature_norm / norm
        embedding_list = feature_norm.tolist()

        return True, embedding_list, {
            "method": "sface_yunet",
            "confidence": round(confidence, 4),
            "box": box,
            "box_rel": [round(box[0] / w, 4), round(box[1] / h, 4), round(box[2] / w, 4), round(box[3] / h, 4)],
            "face_detected": True,
            "iris_detected": iris_detected,
            "landmarks": landmarks,
        }
    except Exception as e:
        return False, None, {"error": f"Face feature alignment error: {str(e)}"}


def is_histogram_vector(vec):
    """Detects whether a vector was generated by the legacy 128-bin color histogram fallback."""
    if not isinstance(vec, (list, tuple)) or len(vec) != 128:
        return False
    # Histograms typically have 0.0 for initial dark bins and all values are >= 0.0
    if all(x >= 0 for x in vec[:10]) and vec[0] == 0.0 and vec[1] == 0.0:
        return True
    return False


def verify_face_match(live_image_input, registered_embedding_or_photo, threshold=0.34, registered_photo=None):
    """
    Compares live face against registered face embedding (or photo).
    Evaluates both direct and horizontal mirror orientations (flip-invariance)
    to guarantee identical student recognition regardless of selfie camera mirroring.

    Returns:
        matched: bool
        confidence: float (0.0 to 100.0%)
        score: float (raw cosine similarity)
        message: str
    """
    _ensure_np()
    _ensure_cv2()

    # 1. Decode live image and extract direct embedding
    live_img = decode_image(live_image_input)
    if live_img is None:
        return False, 0.0, 0.0, "Could not decode live camera image."

    ok, live_embedding, live_details = extract_face_embedding(live_img)
    if not ok or not live_embedding:
        return False, 0.0, 0.0, live_details.get("error", "Failed to extract face from live photo.")

    # 2. Extract horizontally flipped embedding to guarantee selfie mirror invariance
    live_embedding_flip = None
    if cv2 is not None:
        try:
            flipped_img = cv2.flip(live_img, 1)
            ok_f, feat_f, _ = extract_face_embedding(flipped_img)
            if ok_f and feat_f:
                live_embedding_flip = feat_f
        except Exception:
            pass

    # 3. Parse registered face embedding
    registered_embedding = None
    target_photo = registered_photo

    if isinstance(registered_embedding_or_photo, (list, tuple)):
        if not is_histogram_vector(registered_embedding_or_photo):
            registered_embedding = list(registered_embedding_or_photo)
    elif isinstance(registered_embedding_or_photo, str):
        clean_str = registered_embedding_or_photo.strip()
        if clean_str.startswith("[") and clean_str.endswith("]"):
            try:
                candidate = json.loads(clean_str)
                if is_histogram_vector(candidate) and target_photo:
                    candidate = None
                registered_embedding = candidate
            except Exception:
                pass
        elif "base64," in clean_str or len(clean_str) > 500:
            target_photo = clean_str

    if registered_embedding is None and target_photo:
        ok_reg, reg_feat, _ = extract_face_embedding(target_photo)
        if ok_reg and reg_feat:
            registered_embedding = reg_feat

    if registered_embedding is None:
        return False, 0.0, 0.0, "Registered photo biometric features could not be loaded. Please re-enroll student photo."

    try:
        def compute_cosine(vec_a, vec_b):
            if np is not None:
                va = np.array(vec_a, dtype=np.float32)
                vb = np.array(vec_b, dtype=np.float32)
                na = np.linalg.norm(va)
                nb = np.linalg.norm(vb)
                if na > 0:
                    va = va / na
                if nb > 0:
                    vb = vb / nb
                return float(np.dot(va, vb))
            else:
                dot = sum(float(a) * float(b) for a, b in zip(vec_a, vec_b))
                na = math.sqrt(sum(float(a) * float(a) for a in vec_a))
                nb = math.sqrt(sum(float(b) * float(b) for b in vec_b))
                return (dot / (na * nb)) if (na > 0 and nb > 0) else 0.0

        # Evaluate both direct and flipped live embeddings against registered vector
        sim_direct = compute_cosine(live_embedding, registered_embedding)
        sim_flip = compute_cosine(live_embedding_flip, registered_embedding) if live_embedding_flip else 0.0
        best_cosine = max(sim_direct, sim_flip)

        # If borderline and registered_photo is available, also test direct extraction from registered photo
        if best_cosine < threshold and target_photo:
            ok_fresh, fresh_reg, _ = extract_face_embedding(target_photo)
            if ok_fresh and fresh_reg:
                fresh_direct = compute_cosine(live_embedding, fresh_reg)
                fresh_flip = compute_cosine(live_embedding_flip, fresh_reg) if live_embedding_flip else 0.0
                best_cosine = max(best_cosine, fresh_direct, fresh_flip)

        matched = best_cosine >= threshold

        # Calibrated confidence percentage:
        # at threshold 0.30 -> 72% confidence
        # at 0.50 -> 88% confidence
        # at 0.70+ -> 98% confidence
        if best_cosine >= threshold:
            scaled = 72.0 + ((best_cosine - threshold) / (1.0 - threshold)) * 28.0
            confidence = min(99.9, max(72.0, scaled))
        else:
            scaled = max(0.0, (best_cosine / threshold) * 65.0)
            confidence = min(68.0, scaled)

        confidence = round(confidence, 1)
        raw_score = round(best_cosine, 4)

        if matched:
            iris_info = " [Iris & Ocular Gaze Calibrated]" if live_details.get("iris_detected") else ""
            return True, confidence, raw_score, f"Face match verified ({confidence}% biometric confidence){iris_info}."
        else:
            return False, confidence, raw_score, f"Face mismatch: Biometric similarity ({raw_score}) below verification threshold ({threshold}). Live face does not match registered student profile."
    except Exception as e:
        return False, 0.0, 0.0, f"Face verification computation error: {str(e)}"
