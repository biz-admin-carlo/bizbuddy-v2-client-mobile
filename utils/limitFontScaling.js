import { Text, TextInput } from "react-native";

/**
 * Max multiplier for system font size (Dynamic Type / Android font size).
 * 1.0 = no scaling; 1.2 = up to 20% larger than design size.
 */
export const MAX_FONT_SIZE_MULTIPLIER = 1.2;

function capFontScaling(Component) {
  if (Component.defaultProps == null) {
    Component.defaultProps = {};
  }
  Component.defaultProps.maxFontSizeMultiplier = MAX_FONT_SIZE_MULTIPLIER;
}

capFontScaling(Text);
capFontScaling(TextInput);
