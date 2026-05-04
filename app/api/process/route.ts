import { NextResponse } from "next/server";

const GEMINI_API_URL =
  "[generativelanguage.googleapis.com](https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent)";

async function callGemini(prompt: string) {
  const res = await fetch(`${GEMINI_API_URL}?key=${process.env.GEMINI_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
  });

  if (!res.ok) throw new Error("Gemini error");
  const data = await res.json();
  const text =
    data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
  return text;
}

// --- SIMPLE FALLBACK HELPERS ---
function basicAutofix(text: string) {
  return text
    .replace(/\s+/g, " ")
    .replace(/(\w)([.!?])(?=\w)/g, "$1$2 ")
    .replace(/(^\w)|([.!?]\s+\w)/g, (c) => c.toUpperCase());
}

function improveFallback(text: string, tone: string) {
  switch (tone) {
    case "formal":
      return `In a formal style: ${text}`;
    case "casual":
      return `In a relaxed tone: ${text}`;
    case "technical":
      return `Using precise and technical language: ${text}`;
    default:
      return text;
  }
}

function humanizeFallback(text: string) {
  return text
    .replace(/(\butilize\b)/gi, "use")
    .replace(/(\btherefore\b)/gi, "so")
    .replace(/(\bconsequently\b)/gi, "as a result")
    .replace(/(\boverwhelmingly\b)/gi, "mostly")
    .replace(/(\badditionally\b)/gi, "also");
}

function writeFallback(request: string) {
  return `Here's a short piece based on your request: ${request.slice(
    0,
    100
  )}...`;
}

// --- API ROUTE ---
export async function POST(req: Request) {
  try {
    const { input, mode, tone, retry } = await req.json();
    if (!input) return NextResponse.json({ output: "" });

    // --- Prompt construction ---
    let prompt = "";
    switch (mode) {
      case "autofix":
        prompt = `Fix grammar, spelling, punctuation. Keep meaning same. Output only corrected text.\nText: ${input}`;
        break;
      case "improve":
        prompt = `Rewrite the text in a ${tone} tone. Keep meaning same. Output only improved text.\nText: ${input}`;
        break;
      case "humanize":
        prompt = `Rewrite the text to sound natural, human, and simple. Remove AI tone. Output only final text.\nText: ${input}`;
        break;
      case "write":
        prompt = `Generate content based on this request. Keep within 180 words unless user explicitly asks for more. Output only final content.\nRequest: ${input}`;
        break;
      default:
        prompt = input;
    }
    if (retry) prompt += "\nGenerate a different version of the result.";

    // --- Try Gemini once ---
    try {
      const output = await callGemini(prompt);
      if (output) return NextResponse.json({ output });
    } catch {}

    // --- Retry Once Automatically ---
    try {
      const output = await callGemini(prompt);
      if (output) return NextResponse.json({ output });
    } catch {}

    // --- Fallbacks ---
    let fallback = "";
    switch (mode) {
      case "autofix":
        fallback = basicAutofix(input);
        break;
      case "improve":
        fallback = improveFallback(input, tone);
        break;
      case "humanize":
        fallback = humanizeFallback(input);
        break;
      case "write":
        fallback = writeFallback(input);
        break;
      default:
        fallback = input;
    }

    if (!fallback.trim()) {
      return NextResponse.json({
        output: "Server busy right now, try again later.",
      });
    }

    return NextResponse.json({ output: fallback });
  } catch {
    return NextResponse.json({
      output: "Server busy right now, try again later.",
    });
  }
}
