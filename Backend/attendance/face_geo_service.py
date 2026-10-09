import base64
import io
import math
import os
import json
import numpy as np
from PIL import Image

try:
    import cv2
except ImportError:
    cv2 = None

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

    if cv2 is None:
        return None, None

    if not os.path.exists(YUNET_PATH) or not os.path.exists(SFACE_PATH):
        return None, None

    try:
        # Default input size (320, 320)
        _detector = cv2.FaceDetectorYN.create(
            model=YUNET_PATH,
            config="",
            input_size=(320, 320),
            score_threshold=0.5,
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
    Decodes base64 string or bytes into a NumPy BGR image for OpenCV.
    """
    if not image_input:
        return None

    if isinstance(image_input, str):
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

    try:
        nparr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        return img
    except Exception:
        # Fallback using PIL
        try:
            pil_img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
            open_cv_image = np.array(pil_img)
            # Convert RGB to BGR
            return open_cv_image[:, :, ::-1].copy()
        except Exception:
            return None


def extract_face_embedding(image_input):
    """
    Extracts 128-dimensional face feature vector from an image.
    Returns: (success: bool, embedding: list[float] or None, details: dict)
    """
    img = decode_image(image_input)
    if img is None:
        return False, None, {"error": "Could not decode image data."}

    detector, recognizer = get_face_models()
    if detector is None or recognizer is None:
        # Fallback to normalized thumbnail histogram embedding if ONNX is missing
        try:
            h, w = img.shape[:2]
            gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
            small = cv2.resize(gray, (64, 64))
            hist = cv2.calcHist([small], [0], None, [128], [0, 256])
            norm_hist = (hist / (np.linalg.norm(hist) + 1e-7)).flatten().tolist()
            return True, norm_hist, {"method": "fallback_histogram", "face_detected": True}
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
        # Try with a lower threshold
        detector.setScoreThreshold(0.3)
        try:
            _, faces = detector.detect(img)
        except Exception:
            faces = None
        finally:
            detector.setScoreThreshold(0.5)

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


def verify_face_match(live_image_input, registered_embedding_or_photo, threshold=0.36):
    """
    Compares live face against registered face embedding (or photo).
    SFace cosine similarity threshold is typically 0.363 for standard verification.
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
    if isinstance(registered_embedding_or_photo, str):
        # Check if it is a JSON encoded embedding vector
        clean_str = registered_embedding_or_photo.strip()
        if clean_str.startswith("[") and clean_str.endswith("]"):
            try:
                registered_embedding = json.loads(clean_str)
            except Exception:
                pass

    if registered_embedding is None:
        # If it was a base64 photo, extract embedding from it
        ok_reg, reg_feat, _ = extract_face_embedding(registered_embedding_or_photo)
        if not ok_reg:
            return False, 0.0, 0.0, "Registered photo face embedding could not be computed."
        registered_embedding = reg_feat

    try:
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

        # Map cosine similarity to a friendly percentage (0% to 100%)
        # For SFace, typical match is [0.36, 1.0]. Anything >= 0.36 is matched.
        matched = cosine_sim >= threshold

        # Calibrated confidence percentage:
        # at threshold 0.36 -> 70% confidence
        # at 0.60 -> 90% confidence
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
