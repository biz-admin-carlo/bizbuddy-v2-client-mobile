import { Redirect } from "expo-router";

export default function PunchRequestsRedirect() {
  return <Redirect href="/(tabs)/(requests)?type=punch" />;
}
