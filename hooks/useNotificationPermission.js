import { useState, useEffect } from "react";
import { NotificationService } from "../utils/notificationService";

export const useNotificationPermission = () => {
  const [showModal, setShowModal] = useState(false);
  const [permissionStatus, setPermissionStatus] = useState(null);
  const [isChecking, setIsChecking] = useState(true);

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

  const closeModal = () => {
    setShowModal(false);
  };

  const openModal = () => {
    setShowModal(true);
  };

  // Check permissions on mount
  useEffect(() => {
    checkPermissionStatus();
  }, []);

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
