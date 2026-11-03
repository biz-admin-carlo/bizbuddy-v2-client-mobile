import { Redirect } from "expo-router";

export default function OvertimeManageRedirect() {
  return <Redirect href="/(tabs)/(requests)?type=overtime" />;
}
