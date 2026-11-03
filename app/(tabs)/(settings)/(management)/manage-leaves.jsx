import { Redirect } from "expo-router";

export default function ManageLeavesRedirect() {
  return <Redirect href="/(tabs)/(requests)?type=leave" />;
}
