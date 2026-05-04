"use client";
import { useState, useEffect } from "react";

export default function Home() {
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [display, setDisplay] = useState("");
  const [mode, setMode] = useState("autofix");
  const [tone, setTone] = useState("formal");
  const [loading, setLoading] = useState(false);
  const [copiedInput, setCopiedInput] = useState(false);
  const [copiedOutput, setCopiedOutput] = useState(false);

  const process = async (retry = false) => {
    if (!input.trim()) return;
    setLoading(true);
    setDisplay("");

    try {
      const res = await fetch("/api/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input, mode, tone, retry }),
      });

      const data = await res.json();

      let safeOutput =
        data && typeof data.output === "string" && data.output.trim()
          ? data.output
          : "Receiving many requests at once, try again later.";

      safeOutput = safeOutput
        .replace(/undefined/gi, "")
        .replace(/null/gi, "")
        .replace(/([a-z])([A-Z])/g, "$1 $2")
        .replace(/\s+/g, " ")
        .trim();

      setOutput(safeOutput);
    } catch {
      setOutput("Receiving many requests at once, try again later.");
    }

    setLoading(false);
  };

  useEffect(() => {
    if (!output) return;
    const words = output.split(" ").filter(Boolean);
    let i = 0;
    setDisplay("");
    const interval = setInterval(() => {
      if (i >= words.length) {
        clearInterval(interval);
        return;
      }
      setDisplay((prev) => (prev ? prev + " " + words[i] : words[i]));
      i++;
    }, 35);
    return () => clearInterval(interval);
  }, [output]);

  const copy = (text: string, type: "input" | "output") => {
    navigator.clipboard.writeText(text);
    if (type === "input") {
      setCopiedInput(true);
      setTimeout(() => setCopiedInput(false), 1500);
    } else {
      setCopiedOutput(true);
      setTimeout(() => setCopiedOutput(false), 1500);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-gray-900 to-gray-800 text-white">
      <div className="flex justify-between px-10 py-5 border-b border-white/10">
        <h1 className="text-2xl font-semibold tracking-wide">Correcto AI</h1>
        <span className="text-gray-400 text-sm">AI Writing Assistant</span>
      </div>

      <div className="text-center mt-14 px-6">
        <h1 className="text-6xl font-bold leading-tight tracking-tight">
          Write your text,
          <br />
          <span className="bg-gradient-to-r from-blue-400 to-purple-500 text-transparent bg-clip-text">
            AI will do the rest.
          </span>
        </h1>
        <p className="mt-6 text-xl text-gray-300 max-w-full mx-auto whitespace-nowrap overflow-hidden text-ellipsis">
          Instantly refine, enhance, or generate content with powerful AI.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-10 max-w-6xl mx-auto mt-14 px-6">
        {/* LEFT */}
        <div className="bg-white/5 backdrop-blur-xl p-6 rounded-2xl border border-white/10 shadow-2xl">
          <div className="flex gap-4 mb-6 justify-between">
            {["autofix", "improve", "humanize", "write"].map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`flex-1 py-3 text-lg font-medium rounded-full ${
                  mode === m
                    ? "bg-gradient-to-r from-blue-500 to-purple-500"
                    : "bg-gray-700"
                }`}
              >
                {m}
              </button>
            ))}
          </div>

          {mode === "improve" && (
            <div className="flex gap-4 mb-6">
              {["formal", "casual", "technical"].map((t) => (
                <button
                  key={t}
                  onClick={() => setTone(t)}
                  className={`px-5 py-2 rounded-full ${
                    tone === t ? "bg-purple-500" : "bg-gray-700"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          )}

          <div className="relative">
            <textarea
              placeholder="Start writing here..."
              className="w-full h-72 p-6 pr-14 text-[18px] bg-gray-900 rounded-xl border border-gray-700 text-gray-200 outline-none"
              value={input}
              onChange={(e) => setInput(e.target.value)}
            />
            <button
              onClick={() => copy(input, "input")}
              className="absolute top-3 right-3 bg-gray-700 px-3 py-1 rounded text-sm"
            >
              {copiedInput ? "✔ Copied" : "📋"}
            </button>
          </div>
        </div>

        {/* RIGHT */}
        <div className="bg-white/5 backdrop-blur-xl p-6 rounded-2xl border border-white/10 shadow-2xl flex flex-col justify-between">
          <div className="relative">
            <textarea
              placeholder="Your output will appear here..."
              className="w-full h-72 p-6 pr-14 text-[18px] bg-gray-900 rounded-xl border border-gray-700 text-gray-200"
              value={display}
              readOnly
            />
            <button
              onClick={() => copy(display, "output")}
              className="absolute top-3 right-3 bg-gray-700 px-3 py-1 rounded text-sm"
            >
              {copiedOutput ? "✔ Copied" : "📋"}
            </button>
          </div>

          <div className="flex gap-5 justify-center mt-6">
            <button
              onClick={() => process(false)}
              className="px-7 py-3 bg-blue-500 rounded-xl"
            >
              {loading ? "Processing..." : "Process"}
            </button>
            <button
              onClick={() => process(true)}
              className="px-7 py-3 bg-purple-500 rounded-xl"
            >
              Retry
            </button>
            <button
              onClick={() => {
                setInput("");
                setOutput("");
                setDisplay("");
              }}
              className="px-7 py-3 bg-red-500 rounded-xl"
            >
              Clear
            </button>
          </div>
        </div>
      </div>

      <a
        href="mailto:ushriroy17@gmail.com"
        className="fixed bottom-6 right-6 bg-blue-500 px-5 py-3 rounded-full"
      >
        Contact
      </a>
    </div>
  );
}
