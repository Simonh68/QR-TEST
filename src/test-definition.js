export const TEST_DEFINITION = Object.freeze({
  id: "demo-vocabulary-1",
  version: 1,
  title: "מבחן דמה — אוצר מילים",
  questions: Object.freeze([
    { id: "q4", prompt: "journey", options: ["ארוחה", "מסע", "שיעור", "חלון"], correctIndex: 1 },
    { id: "q2", prompt: "borrow", options: ["לשבור", "לשאול", "ללוות", "לסגור"], correctIndex: 2 },
    { id: "q3", prompt: "usually", options: ["בדרך כלל", "אף פעם", "מחר", "בזהירות"], correctIndex: 0 },
    { id: "q1", prompt: "quiet", options: ["שקט", "מהיר", "כבד", "קרוב"], correctIndex: 0 },
    { id: "q5", prompt: "improve", options: ["לשפר", "להסתיר", "להחליף", "למדוד"], correctIndex: 0 },
    { id: "q6", prompt: "enough", options: ["מוקדם", "מספיק", "כמעט", "רחוק"], correctIndex: 1 },
    { id: "q7", prompt: "choose", options: ["לזכור", "לבחור", "לשלוח", "לחכות"], correctIndex: 1 },
    { id: "q8", prompt: "dangerous", options: ["מסוכן", "טעים", "רגיל", "נוח"], correctIndex: 0 },
    { id: "q9", prompt: "neighbour", options: ["מנהל", "נהג", "שכן", "רופא"], correctIndex: 2 },
    { id: "q10", prompt: "perhaps", options: ["ביחד", "אולי", "למטה", "שוב"], correctIndex: 1 }
  ])
});

export function publicTestDefinition() {
  return {
    id: TEST_DEFINITION.id,
    version: TEST_DEFINITION.version,
    title: TEST_DEFINITION.title,
    questions: TEST_DEFINITION.questions.map(({ id, prompt, options, correctIndex }) => ({
      id,
      prompt,
      options,
      correctIndex
    }))
  };
}
