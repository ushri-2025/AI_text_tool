"use client";

import {
  KeyboardEvent,
  useEffect,
  useRef,
  useState,
} from "react";

/* =========================================================
   CONSTANTS
   ========================================================= */

const MAX_INPUT_LENGTH = 5000;

const DEFAULT_EDITOR_HEIGHT = 288;
const MIN_EDITOR_HEIGHT = 220;
const MAX_EDITOR_HEIGHT = 650;

const MIN_INPUT_WIDTH = 360;
const MAX_INPUT_WIDTH = 700;

const MIN_OUTPUT_WIDTH = 360;
const MAX_OUTPUT_WIDTH = 700;

/* =========================================================
   MODE LABELS
   ========================================================= */

const MODE_LABELS: Record<string, string> = {
  autofix: "Grammar",
  improve: "Improve",
  humanize: "Humanize",
  write: "Write",
  rewrite: "Rewrite",
  academic: "Academic",
  professional: "Professional",
  summarize: "Summarize",
};

/* =========================================================
   EXAMPLES
   ========================================================= */

const MODE_EXAMPLES: Record<string, string> = {
  autofix:
    `She don't likes going to college because the teachers is very strict.

Yesterday I have went there and attend a seminar.

The speaker were late, so we waits for almost one hour.`,

  improve:
    `Our project is good and it has many features but sometimes the result is not accurate because image quality is different.

We are trying to make the system better and more reliable.`,

  humanize:
    `Artificial intelligence has significantly transformed various aspects of modern society and continues to provide numerous benefits to individuals.

It has become an important part of modern life.`,

  write:
    `Write an email to my professor asking for a two-day extension for my project submission.

The reason is that I need additional time for testing.`,

  rewrite:
    `The project was difficult because we had many problems while developing it but finally we completed everything successfully.

The team worked hard to solve all the issues.`,

  academic:
    `Our model takes a food image and finds what food is present.

Then we use another model to understand the food area and estimate its size.`,

  professional:
    `hey sir i couldn't finish the project today because there were some problems.

i will submit it tomorrow after completing the remaining work.`,

  summarize:
    `Machine learning is a branch of artificial intelligence that enables computers to learn patterns from data without being explicitly programmed for every task. It is widely used in recommendation systems, fraud detection, healthcare, image recognition, natural language processing, and autonomous vehicles.`,
};

/* =========================================================
   CLEAN DISPLAY TEXT
   ========================================================= */

function cleanDisplayText(
  value: unknown
): string {
  if (typeof value !== "string") {
    return "";
  }

  let text = value;

  text = text.replace(/\r\n/g, "\n");
  text = text.replace(/\r/g, "\n");

  text = text.replace(
    /\bundefined\b/gi,
    ""
  );

  text = text.replace(
    /\bnull\b/gi,
    ""
  );

  text = text.replace(
    /^```(?:text|txt|markdown)?[ \t]*\n?/i,
    ""
  );

  text = text.replace(
    /\n?[ \t]*```[ \t]*$/i,
    ""
  );

  text = text.replace(
    /[ \t]+([,.!?;:])/g,
    "$1"
  );

  text = text.replace(
    /[ \t]{2,}/g,
    " "
  );

  text = text
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n");

  text = text.replace(
    /\n{4,}/g,
    "\n\n\n"
  );

  return text.trim();
}

/* =========================================================
   HOME
   ========================================================= */

export default function Home() {
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [display, setDisplay] = useState("");

  const [mode, setMode] =
    useState("autofix");

  const [tone, setTone] =
    useState("formal");

  const [loading, setLoading] =
    useState(false);

  const [copiedInput, setCopiedInput] =
    useState(false);

  const [copiedOutput, setCopiedOutput] =
    useState(false);

  const [inputError, setInputError] =
    useState("");

  /* =======================================================
     EDITOR DIMENSIONS
     ======================================================= */

  const [inputHeight, setInputHeight] =
    useState(DEFAULT_EDITOR_HEIGHT);

  const [outputHeight, setOutputHeight] =
    useState(DEFAULT_EDITOR_HEIGHT);

  const [inputWidth, setInputWidth] =
    useState<number | null>(null);

  const [outputWidth, setOutputWidth] =
    useState<number | null>(null);

  /* =======================================================
     RESIZE STATE
     ======================================================= */

  const resizingRef =
    useRef<
      | {
          type:
            | "input"
            | "output";

          startX: number;
          startY: number;

          startWidth: number;
          startHeight: number;
        }
      | null
    >(null);

  /* =======================================================
     PLACEHOLDER
     ======================================================= */

  const getPlaceholder = (): string => {
    switch (mode) {
      case "autofix":
        return "Enter text you want to correct...";

      case "improve":
        return "Enter text you want to improve...";

      case "humanize":
        return "Enter text you want to make more natural...";

      case "write":
        return "Tell AI what you want it to write...";

      case "rewrite":
        return "Enter text you want to rewrite...";

      case "academic":
        return "Enter text you want to convert into academic language...";

      case "professional":
        return "Enter text you want to make more professional...";

      case "summarize":
        return "Paste the text you want to summarize...";

      default:
        return "Enter your text...";
    }
  };

  /* =======================================================
     INPUT HANDLER
     ======================================================= */

  const handleInputChange = (
    value: string
  ) => {
    if (
      value.length >
      MAX_INPUT_LENGTH
    ) {
      setInputError(
        "Your text is too long. Please keep it within 5,000 characters."
      );

      setInput(
        value.slice(
          0,
          MAX_INPUT_LENGTH
        )
      );

      return;
    }

    setInputError("");
    setInput(value);
  };

  /* =======================================================
     EXAMPLE
     ======================================================= */

  const useExample = () => {
    const example =
      MODE_EXAMPLES[mode];

    if (!example) {
      return;
    }

    setInput(example);
    setOutput("");
    setDisplay("");
    setInputError("");
  };

  /* =======================================================
     MODE CHANGE
     
     Every mode click starts a fresh workspace.
     
     This means:
     Grammar → work → click Grammar again
     = old input/output disappear.
     
     It also means:
     Grammar → work → click Academic
     = fresh Academic workspace.
     ======================================================= */

  const changeMode = (
    newMode: string
  ) => {
    setMode(newMode);

    setInput("");
    setOutput("");
    setDisplay("");

    setInputError("");

    setCopiedInput(false);
    setCopiedOutput(false);
  };

  /* =======================================================
     CUSTOM RESIZE
     ======================================================= */

  const startResize = (
    event: React.PointerEvent,
    type:
      | "input"
      | "output"
  ) => {
    event.preventDefault();

    const target =
      event.currentTarget
        .parentElement;

    if (!target) {
      return;
    }

    const rect =
      target.getBoundingClientRect();

    resizingRef.current = {
      type,
      startX: event.clientX,
      startY: event.clientY,
      startWidth: rect.width,
      startHeight: rect.height,
    };

    document.body.style.userSelect =
      "none";

    document.body.style.cursor =
      type === "input"
        ? "sw-resize"
        : "se-resize";

    window.addEventListener(
      "pointermove",
      handleResize
    );

    window.addEventListener(
      "pointerup",
      stopResize
    );
  };

  const handleResize = (
    event: PointerEvent
  ) => {
    const resize =
      resizingRef.current;

    if (!resize) {
      return;
    }

    const deltaX =
      event.clientX -
      resize.startX;

    const deltaY =
      event.clientY -
      resize.startY;

    /* =====================================================
       INPUT

       Width grows toward the LEFT.
       ===================================================== */

    if (
      resize.type === "input"
    ) {
      const newHeight =
        Math.min(
          MAX_EDITOR_HEIGHT,
          Math.max(
            MIN_EDITOR_HEIGHT,
            resize.startHeight +
              deltaY
          )
        );

      const newWidth =
        Math.min(
          MAX_INPUT_WIDTH,
          Math.max(
            MIN_INPUT_WIDTH,
            resize.startWidth -
              deltaX
          )
        );

      setInputHeight(
        newHeight
      );

      setInputWidth(
        newWidth
      );

      return;
    }

    /* =====================================================
       OUTPUT

       Normal right-side expansion.
       ===================================================== */

    const newHeight =
      Math.min(
        MAX_EDITOR_HEIGHT,
        Math.max(
          MIN_EDITOR_HEIGHT,
          resize.startHeight +
            deltaY
        )
      );

    const newWidth =
      Math.min(
        MAX_OUTPUT_WIDTH,
        Math.max(
          MIN_OUTPUT_WIDTH,
          resize.startWidth +
            deltaX
        )
      );

    setOutputHeight(
      newHeight
    );

    setOutputWidth(
      newWidth
    );
  };

  const stopResize = () => {
    resizingRef.current =
      null;

    document.body.style.userSelect =
      "";

    document.body.style.cursor =
      "";

    window.removeEventListener(
      "pointermove",
      handleResize
    );

    window.removeEventListener(
      "pointerup",
      stopResize
    );
  };

  /* =======================================================
     PROCESS
     ======================================================= */

  const process = async () => {
    if (loading) {
      return;
    }

    const trimmedInput =
      input.trim();

    if (!trimmedInput) {
      setInputError(
        "Please enter some text first."
      );

      return;
    }

    if (
      input.length >
      MAX_INPUT_LENGTH
    ) {
      setInputError(
        "Your text is too long. Please keep it within 5,000 characters."
      );

      return;
    }

    setInputError("");
    setLoading(true);

    setOutput("");
    setDisplay("");

    const controller =
      new AbortController();

    const timeoutId =
      window.setTimeout(() => {
        controller.abort();
      }, 30000);

    try {
      const response =
        await fetch(
          "/api/process",
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body: JSON.stringify({
              input: trimmedInput,
              mode,
              tone,

              /* Always enabled internally */
              preserveFormatting: true,
            }),

            signal:
              controller.signal,
          }
        );

      let data: unknown =
        null;

      try {
        data =
          await response.json();
      } catch {
        data = null;
      }

      const responseObject =
        data &&
        typeof data ===
          "object"
          ? (data as Record<
              string,
              unknown
            >)
          : null;

      const rawOutput =
        responseObject &&
        typeof responseObject.output ===
          "string"
          ? responseObject.output
          : "";

      const cleanedOutput =
        cleanDisplayText(
          rawOutput
        );

      if (cleanedOutput) {
        setOutput(
          cleanedOutput
        );
      } else if (
        response.status === 429
      ) {
        setOutput(
          "Too many requests right now. Please wait a moment and try again."
        );
      } else if (
        response.status === 503
      ) {
        setOutput(
          "AI service is temporarily busy. Please try again in a moment."
        );
      } else if (
        response.status >= 500
      ) {
        setOutput(
          "The AI service is temporarily unavailable. Please try again."
        );
      } else if (
        response.status >= 400
      ) {
        setOutput(
          "Please check your input and try again."
        );
      } else {
        setOutput(
          "Unable to process the text right now. Please try again."
        );
      }
    } catch (error) {
      if (
        error instanceof
          DOMException &&
        error.name ===
          "AbortError"
      ) {
        setOutput(
          "The request took too long. Please try again."
        );
      } else {
        console.error(
          "Frontend process error:",
          error
        );

        setOutput(
          "Could not connect to the AI service. Please check your connection and try again."
        );
      }
    } finally {
      window.clearTimeout(
        timeoutId
      );

      setLoading(false);
    }
  };

  /* =======================================================
     CTRL + ENTER
     ======================================================= */

  const handleInputKeyDown = (
    event: KeyboardEvent<HTMLTextAreaElement>
  ) => {
    if (
      event.ctrlKey &&
      event.key === "Enter"
    ) {
      event.preventDefault();

      if (!loading) {
        process();
      }
    }
  };

  /* =======================================================
     TYPEWRITER
     ======================================================= */

  useEffect(() => {
    if (!output) {
      setDisplay("");
      return;
    }

    const cleanedOutput =
      cleanDisplayText(output);

    let index = 0;

    setDisplay("");

    const interval =
      window.setInterval(() => {
        if (
          index >=
          cleanedOutput.length
        ) {
          window.clearInterval(
            interval
          );

          return;
        }

        const character =
          cleanedOutput[index];

        setDisplay(
          (previous) =>
            previous + character
        );

        index++;
      }, 8);

    return () => {
      window.clearInterval(
        interval
      );
    };
  }, [output]);

  /* =======================================================
     COPY
     ======================================================= */

  const copy = async (
    text: string,
    type:
      | "input"
      | "output"
  ) => {
    const cleaned =
      cleanDisplayText(text);

    if (!cleaned) {
      return;
    }

    try {
      await navigator.clipboard.writeText(
        cleaned
      );

      if (type === "input") {
        setCopiedInput(true);

        window.setTimeout(() => {
          setCopiedInput(false);
        }, 1500);
      } else {
        setCopiedOutput(true);

        window.setTimeout(() => {
          setCopiedOutput(false);
        }, 1500);
      }
    } catch (error) {
      console.error(
        "Copy failed:",
        error
      );
    }
  };

  /* =======================================================
     CLEAR
     ======================================================= */

  const clearAll = () => {
    setInput("");
    setOutput("");
    setDisplay("");
    setInputError("");
    setCopiedInput(false);
    setCopiedOutput(false);
  };

  /* =======================================================
     WIDTH STYLES
     ======================================================= */

  const inputEditorWidth =
    inputWidth
      ? `${inputWidth}px`
      : "100%";

  const outputEditorWidth =
    outputWidth
      ? `${outputWidth}px`
      : "100%";

  /* =======================================================
     UI
     ======================================================= */

  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-gray-900 to-gray-800 text-white">

      {/* =================================================
          HEADER
      ================================================= */}

      <div className="flex justify-between px-10 py-5 border-b border-white/10">

        <h1 className="text-2xl font-semibold tracking-wide">
          Correcto AI
        </h1>

        <span className="text-gray-400 text-sm">
          AI Writing Assistant
        </span>

      </div>

      {/* =================================================
          HERO
      ================================================= */}

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

      {/* =================================================
          MAIN

          Slightly wider and shifted left so the input
          panel sits more naturally toward the left side.
      ================================================= */}

      <div className="grid md:grid-cols-2 gap-10 max-w-7xl mx-auto mt-14 px-6 md:-translate-x-4">

        {/* =================================================
            LEFT PANEL
        ================================================= */}

        <div className="bg-white/5 backdrop-blur-xl p-6 rounded-2xl border border-white/10 shadow-2xl min-w-0 overflow-visible">

          {/* =================================================
              MODES

              Exactly 2 rows × 4 columns.
          ================================================= */}

          <div className="grid grid-cols-4 gap-3 mb-6">

            {[
              "autofix",
              "improve",
              "humanize",
              "write",
              "rewrite",
              "academic",
              "professional",
              "summarize",
            ].map((m) => (
              <button
                key={m}
                onClick={() =>
                  changeMode(m)
                }
                disabled={loading}
                className={`w-full py-3 px-2 text-base font-medium rounded-full whitespace-nowrap transition-all ${
                  mode === m
                    ? "bg-gradient-to-r from-blue-500 to-purple-500 shadow-lg"
                    : "bg-gray-700 hover:bg-gray-600"
                } ${
                  loading
                    ? "opacity-70 cursor-not-allowed"
                    : ""
                }`}
              >
                {MODE_LABELS[m]}
              </button>
            ))}

          </div>

          {/* =================================================
              TONES
          ================================================= */}

          {mode === "improve" && (
            <div className="flex gap-4 mb-6">

              {[
                "formal",
                "casual",
                "technical",
              ].map((t) => (
                <button
                  key={t}
                  onClick={() =>
                    setTone(t)
                  }
                  disabled={loading}
                  className={`px-5 py-2 rounded-full ${
                    tone === t
                      ? "bg-purple-500"
                      : "bg-gray-700 hover:bg-gray-600"
                  } ${
                    loading
                      ? "opacity-70 cursor-not-allowed"
                      : ""
                  }`}
                >
                  {t}
                </button>
              ))}

            </div>
          )}

          {/* =================================================
              INPUT
          ================================================= */}

          <div
            className="relative max-w-full"
            style={{
              width:
                inputEditorWidth,
              maxWidth:
                "calc(100vw - 48px)",
            }}
          >

            <textarea
              placeholder={getPlaceholder()}
              className={`block w-full p-6 pr-14 text-[18px] placeholder:text-[16px] leading-7 bg-gray-900 rounded-xl border text-gray-200 outline-none overflow-auto ${
                inputError
                  ? "border-red-500"
                  : "border-gray-700"
              }`}
              style={{
                height: `${inputHeight}px`,
                minHeight:
                  `${MIN_EDITOR_HEIGHT}px`,
                maxHeight:
                  `${MAX_EDITOR_HEIGHT}px`,
              }}
              value={input}
              onChange={(e) =>
                handleInputChange(
                  e.target.value
                )
              }
              onKeyDown={
                handleInputKeyDown
              }
              disabled={loading}
              spellCheck
            />

            {/* COPY */}

            <button
              onClick={() =>
                copy(
                  input,
                  "input"
                )
              }
              disabled={
                !input.trim()
              }
              className="absolute top-3 right-3 z-10 bg-gray-700 hover:bg-gray-600 px-3 py-1 rounded text-sm disabled:opacity-50"
            >
              {copiedInput
                ? "✔ Copied"
                : "📋"}
            </button>

            {/* INPUT RESIZE HANDLE */}

            <button
              type="button"
              aria-label="Resize input editor"
              onPointerDown={(event) =>
                startResize(
                  event,
                  "input"
                )
              }
              className="absolute bottom-1 left-1 w-6 h-6 cursor-sw-resize z-20"
            >
              <span className="absolute bottom-1 left-1 w-3 h-[2px] bg-gray-500/70 rotate-[-45deg]" />

              <span className="absolute bottom-2 left-1 w-2 h-[2px] bg-gray-500/50 rotate-[-45deg]" />
            </button>

          </div>

          {/* =================================================
              INPUT ACTIONS
          ================================================= */}

          <div className="flex items-center justify-between mt-3">

            {inputError ? (
              <p className="text-sm text-red-400">
                {inputError}
              </p>
            ) : (
              <p className="text-xs text-gray-500">
                Press Ctrl + Enter to process
              </p>
            )}

            <button
              type="button"
              onClick={useExample}
              disabled={loading}
              className="text-xs text-blue-400 hover:text-blue-300 transition-colors disabled:opacity-50"
            >
              Try example
            </button>

          </div>

        </div>

        {/* =================================================
            RIGHT PANEL
        ================================================= */}

        <div className="bg-white/5 backdrop-blur-xl p-6 rounded-2xl border border-white/10 shadow-2xl min-w-0">

          {/* OUTPUT */}

          <div
            className="relative max-w-full"
            style={{
              width:
                outputEditorWidth,
              maxWidth:
                "calc(100vw - 48px)",
            }}
          >

            <textarea
              placeholder="Your output will appear here..."
              className="block w-full p-6 pr-14 text-[18px] placeholder:text-[16px] leading-7 bg-gray-900 rounded-xl border border-gray-700 text-gray-200 outline-none overflow-auto"
              style={{
                height: `${outputHeight}px`,
                minHeight:
                  `${MIN_EDITOR_HEIGHT}px`,
                maxHeight:
                  `${MAX_EDITOR_HEIGHT}px`,
              }}
              value={display}
              readOnly
            />

            {/* COPY */}

            <button
              onClick={() =>
                copy(
                  display,
                  "output"
                )
              }
              disabled={
                !display.trim()
              }
              className="absolute top-3 right-3 z-10 bg-gray-700 hover:bg-gray-600 px-3 py-1 rounded text-sm disabled:opacity-50"
            >
              {copiedOutput
                ? "✔ Copied"
                : "📋"}
            </button>

            {/* OUTPUT RESIZE HANDLE */}

            <button
              type="button"
              aria-label="Resize output editor"
              onPointerDown={(event) =>
                startResize(
                  event,
                  "output"
                )
              }
              className="absolute bottom-1 right-1 w-6 h-6 cursor-se-resize z-20"
            >
              <span className="absolute bottom-1 right-1 w-3 h-[2px] bg-gray-500/70 rotate-[-45deg]" />

              <span className="absolute bottom-2 right-1 w-2 h-[2px] bg-gray-500/50 rotate-[-45deg]" />
            </button>

          </div>

          {/* =================================================
              BUTTONS
          ================================================= */}

          <div className="flex gap-5 justify-center mt-6">

            <button
              onClick={process}
              disabled={
                loading ||
                !input.trim() ||
                !!inputError
              }
              className="px-7 py-3 bg-blue-500 hover:bg-blue-600 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading
                ? "Processing..."
                : "Process"}
            </button>

            <button
              onClick={process}
              disabled={
                loading ||
                !input.trim() ||
                !!inputError
              }
              className="px-7 py-3 bg-purple-500 hover:bg-purple-600 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Retry
            </button>

            <button
              onClick={clearAll}
              disabled={loading}
              className="px-7 py-3 bg-red-500 hover:bg-red-600 rounded-xl disabled:opacity-50"
            >
              Clear
            </button>

          </div>

        </div>

      </div>

      {/* =================================================
          CONTACT
      ================================================= */}

      <a
        href="mailto:ushriroy17@gmail.com"
        className="fixed bottom-6 right-6 bg-blue-500 hover:bg-blue-600 px-5 py-3 rounded-full"
      >
        Contact
      </a>

    </div>
  );
}