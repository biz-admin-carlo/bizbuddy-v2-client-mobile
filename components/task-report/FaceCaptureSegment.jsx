import { useRef, useState } from "react";
import { Image, Text, TouchableOpacity, View } from "react-native";
import * as Location from "expo-location";
import { Ionicons } from "@expo/vector-icons";
import { buildInscription } from "../../utils/taskReportWatermark";

let CameraView = null;
let useCameraPermissions = null;
try {
  const camera = require("expo-camera");
  CameraView = camera.CameraView;
  useCameraPermissions = camera.useCameraPermissions;
} catch {
  CameraView = null;
  useCameraPermissions = null;
}

function loadCaptureRef() {
  try {
    return require("react-native-view-shot").captureRef;
  } catch {
    return null;
  }
}

function CameraUnavailable() {
  return (
    <View className="bg-amber-50 rounded-2xl p-5 mb-6 border border-amber-200">
      <Text className="text-base text-amber-950">
        The face camera is not in this app build yet. Stop the app and run it
        again with npm run ios so the camera can be added.
      </Text>
    </View>
  );
}

export default function FaceCaptureSegment(props) {
  if (!CameraView || !useCameraPermissions) return <CameraUnavailable />;
  return <FaceCaptureReady {...props} />;
}

function FaceCaptureReady({ timeZone, onChange }) {
  const shotRef = useRef(null);
  const cameraRef = useRef(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [shot, setShot] = useState(null);
  const [blockReason, setBlockReason] = useState(null);
  const [busy, setBusy] = useState(false);

  async function takePhoto() {
    setBlockReason(null);
    setBusy(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setBlockReason("Location is required to stamp the photo.");
        return;
      }
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Highest,
      });
      const inscription = buildInscription({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
        capturedAt: new Date(),
        timeZone,
      });
      const photo = await cameraRef.current?.takePictureAsync({
        quality: 0.7,
        skipProcessing: true,
      });
      if (!photo?.uri) {
        setBlockReason("The camera did not return a photo. Try again.");
        return;
      }
      setShot({ uri: photo.uri, inscription });
      onChange(null);
    } catch {
      setBlockReason("Location is required to stamp the photo.");
    } finally {
      setBusy(false);
    }
  }

  async function usePhoto() {
    if (!shotRef.current) return;
    setBusy(true);
    try {
      const captureRef = loadCaptureRef();
      if (!captureRef) {
        setBlockReason("Photo stamping is not in this app build yet. Run npm run ios again.");
        return;
      }
      const uri = await captureRef(shotRef, {
        format: "jpg",
        quality: 0.8,
        result: "tmpfile",
      });
      onChange({ uri, inscription: shot.inscription });
    } catch {
      setBlockReason("Could not stamp the photo. Try again.");
    } finally {
      setBusy(false);
    }
  }

  function retake() {
    setShot(null);
    setBlockReason(null);
    onChange(null);
  }

  if (!permission?.granted) {
    return (
      <View className="bg-amber-50 rounded-2xl p-5 mb-6 border border-amber-200">
        <Text className="text-base text-amber-950 mb-3">
          Camera access is required to clock out.
        </Text>
        <TouchableOpacity
          onPress={requestPermission}
          className="py-3.5 rounded-2xl items-center bg-slate-900"
        >
          <Text className="text-white font-semibold">Allow camera</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View className="mb-6">
      <View className="flex-row items-center mb-2">
        <View className="w-8 h-8 rounded-full bg-blue-100 items-center justify-center mr-3">
          <Ionicons name="camera-outline" size={18} color="#3b82f6" />
        </View>
        <Text className="text-sm font-semibold text-slate-500 uppercase tracking-wide">
          Face check
        </Text>
      </View>
      {shot ? (
        <View
          ref={shotRef}
          collapsable={false}
          style={{ backgroundColor: "#0f172a" }}
        >
          <Image
            source={{ uri: shot.uri }}
            style={{ width: "100%", height: 280 }}
          />
          <Text
            style={{
              position: "absolute",
              left: 8,
              right: 8,
              bottom: 8,
              color: "#ffffff",
              fontSize: 12,
              fontWeight: "600",
              textShadowColor: "rgba(0,0,0,0.8)",
              textShadowOffset: { width: 0, height: 1 },
              textShadowRadius: 2,
            }}
          >
            {shot.inscription}
          </Text>
        </View>
      ) : (
        <CameraView ref={cameraRef} facing="front" style={{ height: 280 }} />
      )}
      {blockReason ? (
        <Text className="text-sm text-red-600 mt-2">{blockReason}</Text>
      ) : (
        <Text className="text-sm text-slate-600 mt-2">
          A face photo is required. Location, date, and time are printed on it.
        </Text>
      )}
      {shot ? (
        <View className="flex-row mt-3">
          <TouchableOpacity
            onPress={retake}
            className="flex-1 mr-2 py-3.5 rounded-2xl items-center bg-slate-100 border border-slate-200"
          >
            <Text className="text-slate-700 font-semibold">Retake</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={usePhoto}
            disabled={busy}
            className="flex-1 py-3.5 rounded-2xl items-center bg-slate-900"
          >
            <Text className="text-white font-semibold">
              {busy ? "Stamping…" : "Use photo"}
            </Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity
          onPress={takePhoto}
          disabled={busy}
          className="mt-3 py-3.5 rounded-2xl items-center bg-slate-900"
        >
          <Text className="text-white font-semibold">
            {busy ? "Taking photo…" : "Take photo"}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
