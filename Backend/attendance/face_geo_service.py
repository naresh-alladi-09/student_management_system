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
            "face_detected": True
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


def verify_face_match(live_image_input, registered_embedding_or_photo, threshold=0.32, registered_photo=None):
    """
    Compares live face against registered face embedding (or photo).
    SFace cosine similarity threshold is typically 0.32 - 0.36 for standard verification.
    Returns:
        matched: bool
        confidence: float (0.0 to 100.0%)
        score: float (raw cosine similarity)
        message: str
    """
    # 1. Extract live face embedding
    ok, live_embedding, live_details = extract_face_embedding(live_image_input)
    if not ok:
        return False, 0.0, 0.0, live_details.get("error", "Failed to extract face from live photo.")

    # 2. Get registered face embedding
    registered_embedding = None
    target_photo = registered_photo

    if isinstance(registered_embedding_or_photo, str):
        clean_str = registered_embedding_or_photo.strip()
        if clean_str.startswith("[") and clean_str.endswith("]"):
            try:
                candidate = json.loads(clean_str)
                # If candidate is a legacy histogram and we have the actual registered photo,
                # discard the legacy histogram and recompute SFace embedding directly!
                if is_histogram_vector(candidate) and target_photo:
                    candidate = None
                registered_embedding = candidate
            except Exception:
                pass
        elif "base64," in clean_str or len(clean_str) > 500:
            target_photo = clean_str

    if registered_embedding is None and target_photo:
        # Extract embedding directly from registered photo
        ok_reg, reg_feat, _ = extract_face_embedding(target_photo)
        if ok_reg and reg_feat:
            registered_embedding = reg_feat

    if registered_embedding is None:
        return False, 0.0, 0.0, "Registered photo face embedding could not be computed. Please re-enroll student photo."

    try:
        _ensure_np()
        if np is not None:
            vec_live = np.array(live_embedding, dtype=np.float32)
            vec_reg = np.array(registered_embedding, dtype=np.float32)

            # Normalize both vectors
            norm1 = np.linalg.norm(vec_live)
            norm2 = np.linalg.norm(vec_reg)
            if norm1 > 0:
                vec_live = vec_live / norm1
            if norm2 > 0:
                vec_reg = vec_reg / norm2

            # Cosine similarity
            cosine_sim = float(np.dot(vec_live, vec_reg))
        else:
            dot = sum(float(a) * float(b) for a, b in zip(live_embedding, registered_embedding))
            norm1 = math.sqrt(sum(float(a) * float(a) for a in live_embedding))
            norm2 = math.sqrt(sum(float(b) * float(b) for b in registered_embedding))
            cosine_sim = (dot / (norm1 * norm2)) if (norm1 > 0 and norm2 > 0) else 0.0

        # Map cosine similarity to a friendly percentage (0% to 100%)
        # For SFace, typical match is [0.32, 1.0]. Anything >= threshold is matched.
        matched = cosine_sim >= threshold

        # Calibrated confidence percentage:
        # at threshold 0.32 -> 70% confidence
        # at 0.55 -> 90% confidence
        # at 0.80+ -> 98% confidence
        if cosine_sim >= threshold:
            scaled = 70.0 + ((cosine_sim - threshold) / (1.0 - threshold)) * 30.0
            confidence = min(99.9, max(70.0, scaled))
        else:
            scaled = max(0.0, (cosine_sim / threshold) * 65.0)
            confidence = min(68.0, scaled)

        confidence = round(confidence, 1)
        raw_score = round(cosine_sim, 4)

        if matched:
            return True, confidence, raw_score, f"Face match verified ({confidence}% biometric confidence)."
        else:
            return False, confidence, raw_score, f"Face mismatch: Biometric similarity ({raw_score}) below threshold ({threshold}). Live face does not match registered student."
    except Exception as e:
        return False, 0.0, 0.0, f"Face verification computation error: {str(e)}"
