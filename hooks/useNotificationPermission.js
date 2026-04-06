import { useState, useCallback, useEffect, useRef } from "react";
import { NotificationService } from "../utils/notificationService";

export const useNotificationPermission = () => {
  const [showModal, setShowModal] = useState(false);
  const [permissionStatus, setPermissionStatus] = useState(null);
  const [isChecking, setIsChecking] = useState(false);
  const closeTimerRef = useRef(null);

  const checkPermissionStatus = async () => {
    try {
      setIsChecking(true);
      const status = await NotificationService.getPermissionStatus();
      setPermissionStatus(status);

      // Show modal if permissions are not granted and can be requested
      if (!status.granted && status.canAskAgain) {
        setShowModal(true);
      }

      return status;
    } catch (error) {
      console.error("Error checking notification permission:", error);
      return null;
    } finally {
      setIsChecking(false);
    }
  };

  const requestPermissions = async () => {
    try {
      const result = await NotificationService.requestPermissions();
      if (result && result.granted) {
        setPermissionStatus({
          ...permissionStatus,
          granted: true,
          status: "granted",
        });
        setShowModal(false);
        return result;
      }
      return result;
    } catch (error) {
      console.error("Error requesting notification permissions:", error);
      return null;
    }
  };

  // Defer hiding slightly so the native Modal can finish dismiss before the parent
  // flips `visible` (reduces intermittent touch/UI lock on RN Fabric with Modal).
  const closeModal = useCallback(() => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    closeTimerRef.current = setTimeout(() => {
      closeTimerRef.current = null;
      setShowModal(false);
    }, 0);
  }, []);

  useEffect(
    () => () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    },
    []
  );

  const openModal = () => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    setShowModal(true);
  };

  // Initial prompt is driven by Profile (token + delay + token sync). Avoid a second
  // mount-time check here — it raced with Profile's timer and doubled getPermissionsAsync.

  return {
    showModal,
    permissionStatus,
    isChecking,
    checkPermissionStatus,
    requestPermissions,
    closeModal,
    openModal,
  };
};
