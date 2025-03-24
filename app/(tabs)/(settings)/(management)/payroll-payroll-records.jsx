// File: app/(tabs)/(settings)/(management)/payroll-payroll-records.jsx

"use client";

import React from "react";
import TemporaryPage from "../../../../components/temporary-page";
import { View, StyleSheet } from "react-native";

function PayrollPayrollRecords() {
  return (
    <View style={styles.container}>
      <TemporaryPage />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: "100%",
  },
});

export default PayrollPayrollRecords;
