import { Redirect } from "expo-router";

export default function LeavesApprovalRedirect() {
  return <Redirect href="/(tabs)/(requests)?type=leave" />;
}
