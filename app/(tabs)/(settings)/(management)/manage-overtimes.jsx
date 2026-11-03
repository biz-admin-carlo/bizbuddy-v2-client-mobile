import { Redirect } from "expo-router";

export default function ManageOvertimesRedirect() {
  return <Redirect href="/(tabs)/(requests)?type=overtime" />;
}
