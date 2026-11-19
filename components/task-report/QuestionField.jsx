import { Text, TextInput, TouchableOpacity, View } from "react-native";

export default function QuestionField({ question, value, onChange, error }) {
  const label = (
    <Text className="text-base font-semibold text-slate-800 mb-1">
      {question.label}
      {question.required ? <Text className="text-red-500"> *</Text> : null}
    </Text>
  );
  const help = question.helpText ? (
    <Text className="text-sm text-slate-500 mb-2">{question.helpText}</Text>
  ) : null;
  const errorText = error ? (
    <Text className="text-sm text-red-600 mt-1">{error}</Text>
  ) : null;

  if (
    question.type === "short_text" ||
    question.type === "paragraph" ||
    question.type === "number"
  ) {
    return (
      <View className="mb-4">
        {label}
        {help}
        <TextInput
          className="bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-base text-slate-900"
          value={value == null ? "" : String(value)}
          onChangeText={onChange}
          multiline={question.type === "paragraph"}
          keyboardType={question.type === "number" ? "decimal-pad" : "default"}
        />
        {errorText}
      </View>
    );
  }

  if (question.type === "yes_no") {
    return (
      <View className="mb-4">
        {label}
        {help}
        <View className="flex-row">
          {[
            ["Yes", true],
            ["No", false],
          ].map(([caption, next]) => {
            const selected = value === next;
            return (
              <TouchableOpacity
                key={caption}
                onPress={() => onChange(next)}
                className={`mr-2 px-4 py-3 rounded-2xl border ${selected ? "bg-slate-900 border-slate-900" : "bg-slate-50 border-slate-200"}`}
              >
                <Text
                  className={
                    selected
                      ? "text-white font-semibold"
                      : "text-slate-800 font-semibold"
                  }
                >
                  {caption}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        {errorText}
      </View>
    );
  }

  if (
    question.type === "single_choice" ||
    question.type === "dropdown" ||
    question.type === "checkboxes"
  ) {
    const selected = Array.isArray(value) ? value : [];
    const options = Array.isArray(question.options) ? question.options : [];
    return (
      <View className="mb-4">
        {label}
        {help}
        {options.map((option) => {
          const on =
            question.type === "checkboxes"
              ? selected.includes(option)
              : value === option;
          return (
            <TouchableOpacity
              key={option}
              onPress={() => {
                if (question.type === "checkboxes") {
                  onChange(
                    on
                      ? selected.filter((item) => item !== option)
                      : [...selected, option],
                  );
                } else {
                  onChange(option);
                }
              }}
              className={`mb-2 px-4 py-3 rounded-2xl border ${on ? "bg-blue-50 border-blue-200" : "bg-slate-50 border-slate-200"}`}
            >
              <Text className="text-base text-slate-800">{option}</Text>
            </TouchableOpacity>
          );
        })}
        {errorText}
      </View>
    );
  }

  if (question.type === "date" || question.type === "time") {
    return (
      <View className="mb-4">
        {label}
        {help}
        <TextInput
          className="bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-base text-slate-900"
          placeholder={question.type === "date" ? "YYYY-MM-DD" : "HH:mm"}
          placeholderTextColor="#94a3b8"
          value={value == null ? "" : String(value)}
          onChangeText={onChange}
          autoCapitalize="none"
        />
        {errorText}
      </View>
    );
  }

  return (
    <View className="mb-4">
      {label}
      <Text className="text-sm text-slate-400">
        Unsupported question: {question.type}
      </Text>
    </View>
  );
}
