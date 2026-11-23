import { useState } from "react";
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from "react-native";
import QuestionField from "./QuestionField";
import { validateAnswers } from "../../utils/taskReportAnswers";

const LATE_NOTICE =
  "This shift was already closed. Your answers are saved to that punch.";

export default function TaskReportFormSheet({
  report,
  timeZone,
  notice,
  submitting = false,
  maxHeight,
  onCancel,
  onSubmit,
}) {
  const [answers, setAnswers] = useState({});
  const [errors, setErrors] = useState({});
  const form = report?.form;

  if (!report?.required && !form) {
    return (
      <View className="px-6 pt-4">
        <View className="bg-slate-50 rounded-2xl p-5 mb-6 border border-slate-200">
          <Text className="text-base text-slate-600 text-center">
            No end-of-shift form applies. Clock-out will not ask for one.
          </Text>
        </View>
        <TouchableOpacity
          onPress={onCancel}
          className="py-3.5 rounded-2xl items-center bg-slate-100 border border-slate-200 mb-8"
        >
          <Text className="text-slate-700 font-semibold text-base">Close</Text>
        </TouchableOpacity>
      </View>
    );
  }

  function submit() {
    const result = validateAnswers(form?.questions || [], answers);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    onSubmit({ answers: result.cleaned });
  }

  return (
    <ScrollView
      className="px-6"
      style={maxHeight ? { maxHeight } : undefined}
      keyboardShouldPersistTaps="handled"
      bounces={false}
      alwaysBounceVertical={false}
      overScrollMode="never"
    >
      <Text className="text-2xl font-bold text-slate-900 mb-2 text-center">
        {form?.name || "End of shift"}
      </Text>
      {form?.description ? (
        <Text className="text-base text-slate-600 text-center mb-4">
          {form.description}
        </Text>
      ) : null}
      {notice ? (
        <Text className="text-sm text-slate-600 text-center mb-4">{notice}</Text>
      ) : null}
      {report?.shift?.name ? (
        <Text className="text-sm text-slate-500 text-center mb-4">
          {report.shift.name}
        </Text>
      ) : null}
      {(form?.questions || []).map((question) => (
        <QuestionField
          key={question.id}
          question={question}
          value={answers[question.id]}
          error={errors[question.id]}
          onChange={(next) =>
            setAnswers((prev) => ({ ...prev, [question.id]: next }))
          }
        />
      ))}
      <TouchableOpacity
        onPress={submit}
        disabled={submitting}
        className="py-4 rounded-2xl items-center bg-slate-900 mb-3"
      >
        {submitting ? (
          <ActivityIndicator color="#ffffff" />
        ) : (
          <Text className="text-white font-bold text-base">
            {notice === LATE_NOTICE ? "Submit report" : "Submit and clock out"}
          </Text>
        )}
      </TouchableOpacity>
      <TouchableOpacity
        onPress={onCancel}
        disabled={submitting}
        className="py-3.5 rounded-2xl items-center bg-slate-100 border border-slate-200 mb-8"
      >
        <Text className="text-slate-700 font-semibold text-base">Cancel</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

export { LATE_NOTICE };
