import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import styles from "./Chatbot.module.css";

/**
 * Creates a pleasant notification chime using Web Audio API
 */
function createNotificationSound(): () => void {
  let audioContext: AudioContext | null = null;

  return () => {
    try {
      if (!audioContext) {
        audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      }
      const now = audioContext.currentTime;
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      oscillator.frequency.setValueAtTime(659.25, now);
      oscillator.frequency.setValueAtTime(783.99, now + 0.1);
      oscillator.type = "sine";
      gainNode.gain.setValueAtTime(0, now);
      gainNode.gain.linearRampToValueAtTime(0.3, now + 0.02);
      gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
      oscillator.start(now);
      oscillator.stop(now + 0.3);
    } catch {
      // ignore
    }
  };
}

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

function formatMessageContent(content: string): React.ReactNode {
  const lines = content.split("\n");

  return lines.map((line, lineIndex) => {
    const combinedPattern =
      /(https?:\/\/[^\s]+)|(\*\*([^*]+)\*\*)|((?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4})/g;

    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match;

    while ((match = combinedPattern.exec(line)) !== null) {
      if (match.index > lastIndex) {
        parts.push(line.slice(lastIndex, match.index));
      }

      const [fullMatch, url, boldFull, boldText, phone] = match;

      if (url) {
        parts.push(
          <a
            key={`${lineIndex}-${match.index}`}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.link}
          >
            {url}
          </a>
        );
      } else if (boldFull && boldText) {
        parts.push(<strong key={`${lineIndex}-${match.index}`}>{boldText}</strong>);
      } else if (phone) {
        const cleanPhone = phone.replace(/[^\d+]/g, "");
        parts.push(
          <a
            key={`${lineIndex}-${match.index}`}
            href={`tel:${cleanPhone}`}
            className={styles.phoneLink}
          >
            {phone}
          </a>
        );
      }

      lastIndex = match.index + fullMatch.length;
    }

    if (lastIndex < line.length) {
      parts.push(line.slice(lastIndex));
    }
    if (parts.length === 0) {
      parts.push(line);
    }

    return (
      <span key={lineIndex}>
        {parts}
        {lineIndex < lines.length - 1 && <br />}
      </span>
    );
  });
}

const CHAT_ENDPOINT = process.env.REACT_APP_CHATBOT_URL
  ? `${process.env.REACT_APP_CHATBOT_URL}/chat`
  : "/api/chat";

const SYSTEM_PROMPT =
  "You are an upbeat assistant for Playfunia indoor playgrounds. Provide concise, friendly answers and suggest next steps when helpful.";

// Phrases that cycle next to the floating button — short capability teasers.
const CAPABILITY_PHRASES = [
  "Plan a birthday party 🎂",
  "Check today's hours ⏰",
  "Find ticket prices 🎟️",
  "Compare memberships 💳",
  "See current deals 🎁",
  "Ask me anything ✨",
];

// Quick-start chips shown on first open. Clicking sends the prompt directly.
const QUICK_PROMPTS: { emoji: string; label: string; prompt: string }[] = [
  { emoji: "🎂", label: "Birthday party for 10 kids?",     prompt: "How much for a birthday party for 10 kids?" },
  { emoji: "⏰", label: "Are you open right now?",         prompt: "Are you open right now?" },
  { emoji: "🎟️", label: "Ticket prices",                   prompt: "What are your open play ticket prices?" },
  { emoji: "💳", label: "Membership plans",                prompt: "Tell me about your membership plans" },
  { emoji: "🎁", label: "Current deals & promos",          prompt: "What promotions are running right now?" },
  { emoji: "❓", label: "Do we need a waiver?",             prompt: "Do we need to sign a waiver?" },
];

// SVG icons — inline so no extra deps and we can animate fill/stroke.
const ChatIcon = () => (
  <svg viewBox="0 0 24 24" width="28" height="28" fill="none" aria-hidden="true">
    <path
      d="M4 5a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H9.5l-4 4a.75.75 0 0 1-1.25-.56V16A3 3 0 0 1 4 13Z"
      fill="currentColor"
    />
    <circle cx="9" cy="9" r="1.1" fill="#fff" />
    <circle cx="12" cy="9" r="1.1" fill="#fff" />
    <circle cx="15" cy="9" r="1.1" fill="#fff" />
  </svg>
);

const CloseIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
    <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
  </svg>
);

const ExpandIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
    <path
      d="M4 9V5a1 1 0 0 1 1-1h4M20 9V5a1 1 0 0 0-1-1h-4M4 15v4a1 1 0 0 0 1 1h4M20 15v4a1 1 0 0 1-1 1h-4"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    />
  </svg>
);

const CollapseIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
    <path
      d="M9 4v4a1 1 0 0 1-1 1H4M15 4v4a1 1 0 0 0 1 1h4M9 20v-4a1 1 0 0 0-1-1H4M15 20v-4a1 1 0 0 1 1-1h4"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    />
  </svg>
);

const SendIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
    <path
      d="M3 11.5 21 3l-8.5 18-2-7-7.5-2.5Z"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
      strokeLinecap="round"
      fill="rgba(255,255,255,0.15)"
    />
  </svg>
);

export function Chatbot() {
  const [isOpen, setIsOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [phraseIndex, setPhraseIndex] = useState(0);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        "Hi! I'm the Playfunia helper. Ask me about prices, hours, parties, memberships — or pick a question below to get started 👇",
    },
  ]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const playNotificationRef = useRef<(() => void) | null>(null);

  // Has the user sent at least one message? Controls whether quick chips show.
  const hasUserChatted = useMemo(
    () => messages.some(m => m.role === "user"),
    [messages]
  );

  useEffect(() => {
    playNotificationRef.current = createNotificationSound();
  }, []);

  // Cycle the capability phrase while the bot is closed.
  useEffect(() => {
    if (isOpen) return;
    const interval = window.setInterval(() => {
      setPhraseIndex(i => (i + 1) % CAPABILITY_PHRASES.length);
    }, 2800);
    return () => window.clearInterval(interval);
  }, [isOpen]);

  // Lock body scroll while in fullscreen, restore when leaving.
  useEffect(() => {
    if (!(isOpen && isFullscreen)) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [isOpen, isFullscreen]);

  // Auto-scroll to newest message.
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, isSending]);

  // Cleanup any in-flight request on unmount.
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, []);

  const playNotificationSound = useCallback(() => {
    playNotificationRef.current?.();
  }, []);

  const handleInputChange = useCallback((event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(event.target.value);
    const textarea = event.target;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 140)}px`;
  }, []);

  const toggle = useCallback(() => {
    setIsOpen(prev => {
      if (prev && abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      // Exit fullscreen when closing.
      if (prev) setIsFullscreen(false);
      return !prev;
    });
  }, []);

  const payloadMessages = useMemo(() => {
    const history = messages.map(message => ({
      role: message.role,
      content: message.content,
    }));
    return [{ role: "system", content: SYSTEM_PROMPT }, ...history];
  }, [messages]);

  const sendPrompt = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;

      if (abortControllerRef.current) abortControllerRef.current.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      const userMessage: Message = {
        id: `user-${Date.now()}`,
        role: "user",
        content: trimmed,
      };
      setMessages(prev => [...prev, userMessage]);
      setInput("");
      setError(null);
      if (textareaRef.current) textareaRef.current.style.height = "auto";

      setIsSending(true);
      fetch(CHAT_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...payloadMessages, { role: "user", content: trimmed }],
        }),
        signal: controller.signal,
      })
        .then(async response => {
          if (!response.ok) {
            const detail = await response.text();
            throw new Error(detail || "The assistant is unavailable right now.");
          }
          return response.json() as Promise<{ reply: string }>;
        })
        .then(data => {
          setMessages(prev => [
            ...prev,
            {
              id: `assistant-${Date.now()}`,
              role: "assistant",
              content: data.reply || "I didn't receive a response. Could you try asking again?",
            },
          ]);
          playNotificationSound();
        })
        .catch(errorInstance => {
          if (
            controller.signal.aborted ||
            (errorInstance instanceof Error && errorInstance.name === "AbortError")
          ) {
            return;
          }
          setError(errorInstance instanceof Error ? errorInstance.message : "Something went wrong.");
        })
        .finally(() => {
          if (abortControllerRef.current === controller) {
            setIsSending(false);
            abortControllerRef.current = null;
          }
        });
    },
    [payloadMessages, playNotificationSound]
  );

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    sendPrompt(input);
  };

  const panelClass = [
    styles.panel,
    isFullscreen ? styles.panelFullscreen : "",
  ].filter(Boolean).join(" ");

  return (
    <div className={styles.widget} aria-live="polite">
      {isOpen ? (
        <>
          {isFullscreen ? <div className={styles.backdrop} onClick={() => setIsFullscreen(false)} /> : null}
          <div className={panelClass} role="dialog" aria-label="Playfunia chatbot">
            <div className={styles.header}>
              <div className={styles.headerLeft}>
                <div className={styles.avatar}>
                  <ChatIcon />
                  <span className={styles.statusDot} aria-hidden="true" />
                </div>
                <div className={styles.headerText}>
                  <h3>Playfunia Helper</h3>
                  <span className={styles.statusText}>Online · usually replies in seconds</span>
                </div>
              </div>
              <div className={styles.headerActions}>
                <button
                  className={`${styles.iconButton} ${styles.hideOnMobile}`}
                  onClick={() => setIsFullscreen(f => !f)}
                  aria-label={isFullscreen ? "Collapse to compact" : "Expand to full screen"}
                  title={isFullscreen ? "Collapse" : "Expand"}
                >
                  {isFullscreen ? <CollapseIcon /> : <ExpandIcon />}
                </button>
                <button
                  className={styles.iconButton}
                  onClick={toggle}
                  aria-label="Close chat"
                  title="Close"
                >
                  <CloseIcon />
                </button>
              </div>
            </div>

            <div className={styles.messages}>
              {messages.map(message => (
                <div
                  key={message.id}
                  className={`${styles.message} ${message.role === "user" ? styles.messageUser : styles.messageBot}`}
                >
                  {formatMessageContent(message.content)}
                </div>
              ))}

              {!hasUserChatted ? (
                <div className={styles.quickPrompts}>
                  {QUICK_PROMPTS.map((q, i) => (
                    <button
                      key={q.label}
                      type="button"
                      className={styles.quickChip}
                      style={{ animationDelay: `${0.1 + i * 0.06}s` }}
                      onClick={() => sendPrompt(q.prompt)}
                      disabled={isSending}
                    >
                      <span className={styles.chipEmoji}>{q.emoji}</span>
                      <span>{q.label}</span>
                    </button>
                  ))}
                </div>
              ) : null}

              {isSending ? (
                <div className={`${styles.message} ${styles.messageBot} ${styles.typing}`}>
                  <span className={styles.typingDot} />
                  <span className={styles.typingDot} />
                  <span className={styles.typingDot} />
                </div>
              ) : null}

              <div ref={messagesEndRef} />
            </div>

            <form className={styles.composer} onSubmit={handleSubmit}>
              <textarea
                ref={textareaRef}
                value={input}
                onChange={handleInputChange}
                onKeyDown={event => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    if (input.trim() && !isSending) {
                      handleSubmit(event as unknown as React.FormEvent<HTMLFormElement>);
                    }
                  }
                }}
                placeholder="Ask anything about Playfunia..."
                rows={1}
                maxLength={2000}
                disabled={isSending}
              />
              <button
                type="submit"
                disabled={isSending || !input.trim()}
                aria-label="Send message"
              >
                <SendIcon />
              </button>
            </form>

            {error ? <div className={styles.status}>{error}</div> : null}
          </div>
        </>
      ) : (
        <div className={styles.launcher}>
          <button
            className={styles.tooltipBubble}
            onClick={toggle}
            aria-label={`Open chat. Tip: ${CAPABILITY_PHRASES[phraseIndex]}`}
          >
            <span key={phraseIndex} className={styles.tooltipPhrase}>
              {CAPABILITY_PHRASES[phraseIndex]}
            </span>
            <span className={styles.tooltipTail} aria-hidden="true" />
          </button>
          <button
            className={styles.fab}
            onClick={toggle}
            aria-label="Open Playfunia chatbot"
          >
            <span className={styles.fabAura} aria-hidden="true" />
            <span className={styles.fabIcon}>
              <ChatIcon />
            </span>
            <span className={styles.fabSparkle} aria-hidden="true">✨</span>
          </button>
        </div>
      )}
    </div>
  );
}
