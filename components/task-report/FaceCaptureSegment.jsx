import { useEffect, useRef, useState } from "react";
import { Image, Linking, Text, TouchableOpacity, View } from "react-native";
import * as Location from "expo-location";
import { Ionicons } from "@expo/vector-icons";
import Svg, { Path } from "react-native-svg";
import { buildInscription } from "../../utils/taskReportWatermark";
import {
  deletePunchPhoto,
  MAX_FACE_PHOTO_BYTES,
  photoSize,
} from "../../utils/punchPhotoStore";

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

const CAMERA_HEIGHT = 280;

const HEAD_AND_SHOULDERS = [
  "M 20 285",
  "C 20 240, 60 225, 118 215",
  "L 122 196",
  "C 92 180, 80 140, 80 110",
  "C 80 60, 112 30, 150 30",
  "C 188 30, 220 60, 220 110",
  "C 220 140, 208 180, 178 196",
  "L 182 215",
  "C 240 225, 280 240, 280 285",
].join(" ");

function HeadOutline() {
  return (
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 1,
        elevation: 1,
      }}
    >
      <Svg
        width="100%"
        height="100%"
        viewBox={`0 0 300 ${CAMERA_HEIGHT}`}
        preserveAspectRatio="xMidYMid meet"
      >
        <Path
          d={HEAD_AND_SHOULDERS}
          fill="none"
          stroke="rgba(255,255,255,0.9)"
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </View>
  );
}

const INFO_POINTS = [
  "It confirms that you are the person clocking in or out.",
  "Your location, date, and time are printed on the photo.",
  "Only your company's supervisors and admins can see it.",
  "It is stored privately and deleted after 90 days.",
  "It is a photo only. The app does not scan or recognize faces.",
];

function FacePhotoInfo() {
  return (
    <View className="bg-blue-50 rounded-2xl p-4 mb-3 border border-blue-100">
      <Text className="text-sm font-semibold text-blue-950 mb-2">
        Why a face photo?
      </Text>
      {INFO_POINTS.map((point) => (
        <View key={point} className="flex-row mb-1">
          <Text className="text-sm text-blue-950 mr-2">•</Text>
          <Text className="text-sm text-blue-950 flex-1">{point}</Text>
        </View>
      ))}
    </View>
  );
}

export default function FaceCaptureSegment(props) {
  if (!CameraView || !useCameraPermissions) return <CameraUnavailable />;
  return <FaceCaptureReady {...props} />;
}

function FaceCaptureReady({ timeZone, onChange, action = "out" }) {
  const shotRef = useRef(null);
  const cameraRef = useRef(null);
  const rawUriRef = useRef(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [shot, setShot] = useState(null);
  const [blockReason, setBlockReason] = useState(null);
  const [busy, setBusy] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const verb = action === "in" ? "clock in" : "clock out";

  useEffect(() => () => deletePunchPhoto(rawUriRef.current), []);

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
      const capturedAt = new Date();
      const inscription = buildInscription({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
        capturedAt,
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
      deletePunchPhoto(rawUriRef.current);
      rawUriRef.current = photo.uri;
      setShot({
        uri: photo.uri,
        inscription,
        capturedAt: capturedAt.toISOString(),
        location: {
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
        },
      });
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
      const size = photoSize(uri);
      if (!size || size > MAX_FACE_PHOTO_BYTES) {
        deletePunchPhoto(uri);
        setBlockReason("The photo is too large or unreadable. Retake it.");
        return;
      }
      onChange({
        uri,
        inscription: shot.inscription,
        capturedAt: shot.capturedAt,
        location: shot.location,
      });
    } catch {
      setBlockReason("Could not stamp the photo. Try again.");
    } finally {
      setBusy(false);
    }
  }

  function retake() {
    deletePunchPhoto(rawUriRef.current);
    rawUriRef.current = null;
    setShot(null);
    setBlockReason(null);
    onChange(null);
  }

  if (!permission?.granted) {
    return (
      <View className="bg-amber-50 rounded-2xl p-5 mb-6 border border-amber-200">
        <Text className="text-base text-amber-950 mb-3">
          Camera access is required to {verb}.
        </Text>
        <TouchableOpacity
          onPress={
            permission?.canAskAgain === false
              ? () => Linking.openSettings()
              : requestPermission
          }
          className="py-3.5 rounded-2xl items-center bg-slate-900"
        >
          <Text className="text-white font-semibold">
            {permission?.canAskAgain === false ? "Open Settings" : "Allow camera"}
          </Text>
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
        <Text className="text-sm font-semibold text-slate-500 uppercase tracking-wide flex-1">
          Face check
        </Text>
        <TouchableOpacity
          onPress={() => setShowInfo((v) => !v)}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={showInfo ? "Hide why a face photo is needed" : "Why a face photo is needed"}
        >
          <Ionicons
            name={showInfo ? "information-circle" : "information-circle-outline"}
            size={24}
            color="#3b82f6"
          />
        </TouchableOpacity>
      </View>
      {showInfo ? <FacePhotoInfo /> : null}
      {shot ? (
        <View
          ref={shotRef}
          collapsable={false}
          style={{ backgroundColor: "#0f172a" }}
        >
          <Image
            source={{ uri: shot.uri }}
            style={{ width: "100%", height: CAMERA_HEIGHT }}
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
        <View style={{ height: CAMERA_HEIGHT }}>
          <CameraView ref={cameraRef} facing="front" style={{ flex: 1 }} />
          <HeadOutline />
        </View>
      )}
      {blockReason ? (
        <Text className="text-sm text-red-600 mt-2">{blockReason}</Text>
      ) : shot ? (
        <Text className="text-sm text-slate-600 mt-2">
          Check that your face is clear. Location, date, and time are printed on it.
        </Text>
      ) : (
        <Text className="text-sm text-slate-600 mt-2">
          Fit your face inside the outline, then tap Take photo.
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
