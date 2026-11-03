import { useMemo } from "react";
import { View } from "react-native";
import QRCode from "qrcode/lib/core/qrcode";

export function OtpQr({ value, pixelSize = 220 }) {
  const matrix = useMemo(() => {
    if (!value) return null;
    try {
      return QRCode.create(value, { errorCorrectionLevel: "M" }).modules;
    } catch {
      return null;
    }
  }, [value]);

  if (!matrix) return null;

  const cell = pixelSize / matrix.size;
  const rows = [];
  for (let row = 0; row < matrix.size; row += 1) {
    const cells = [];
    for (let col = 0; col < matrix.size; col += 1) {
      cells.push(
        <View
          key={col}
          style={{
            width: cell,
            height: cell,
            backgroundColor: matrix.get(row, col) ? "#0f172a" : "#ffffff",
          }}
        />,
      );
    }
    rows.push(
      <View key={row} style={{ flexDirection: "row" }}>
        {cells}
      </View>,
    );
  }

  return (
    <View className="bg-white p-3 rounded-xl border border-slate-200 self-center mb-4">
      {rows}
    </View>
  );
}
