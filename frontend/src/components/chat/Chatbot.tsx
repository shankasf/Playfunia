import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import styles from "./Chatbot.module.css";

/**
 * Creates a pleasant notification chime using Web Audio API
 */
function createNotificationSound(): () => void {
  let audioContext: AudioContext | null = null;

  return () => {
    try {
      // Create or reuse audio context
      if (!audioContext) {
        audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      }

      const now = audioContext.currentTime;

      // Create oscillator for the chime
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      // Pleasant chime frequency (E5 note)
      oscillator.frequency.setValueAtTime(659.25, now);
      oscillator.frequency.setValueAtTime(783.99, now + 0.1); // G5
      oscillator.type = "sine";

      // Envelope for smooth sound
      gainNode.gain.setValueAtTime(0, now);
      gainNode.gain.linearRampToValueAtTime(0.3, now + 0.02);
      gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.3);

      oscillator.start(now);
      oscillator.stop(now + 0.3);
    } catch {
      // Ignore errors (e.g., audio not supported)
    }
  };
}

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

/**
 * Formats message content with clickable links, phone numbers, and basic styling.
 * - URLs become clickable links
 * - Phone numbers become tel: links
 * - **text** becomes bold
 * - Line breaks are preserved
 */
function formatMessageContent(content: string): React.ReactNode {
  // Split by line breaks first to preserve them
  const lines = content.split("\n");

  return lines.map((line, lineIndex) => {
    // Combined regex for URLs, phone numbers, and bold text
    const combinedPattern =
      /(https?:\/\/[^\s]+)|(\*\*([^*]+)\*\*)|((?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4})/g;

    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match;

    while ((match = combinedPattern.exec(line)) !== null) {
      // Add text before the match
      if (match.index > lastIndex) {
        parts.push(line.slice(lastIndex, match.index));
      }

      const [fullMatch, url, boldFull, boldText, phone] = match;

      if (url) {
        // URL match
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
        // Bold text match
        parts.push(
          <strong key={`${lineIndex}-${match.index}`}>{boldText}</strong>
        );
      } else if (phone) {
        // Phone number match - clean it for the tel: link
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

    // Add remaining text after last match
    if (lastIndex < line.length) {
      parts.push(line.slice(lastIndex));
    }

    // If no matches, just return the line
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

const CHAT_ENDPOINT = process.env.REACT_APP_CHATBOT_API_URL ?? "/api/chat";
const SYSTEM_PROMPT =
  "You are an upbeat assistant for Playfunia indoor playgrounds. Provide concise, friendly answers and suggest next steps when helpful.";

export function Chatbot() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content: "Hi there! I'm your Playfunia helper. How can I make your visit easier today?",
    },
  ]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // AbortController ref to cancel in-flight requests
  const abortControllerRef = useRef<AbortController | null>(null);
  // Textarea ref for auto-resize
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  // Notification sound function ref
  const playNotificationRef = useRef<(() => void) | null>(null);

  // Initialize notification sound
  useEffect(() => {
    playNotificationRef.current = createNotificationSound();
  }, []);

  // Play notification sound
  const playNotificationSound = useCallback(() => {
    if (playNotificationRef.current) {
      playNotificationRef.current();
    }
  }, []);

  // Auto-resize textarea based on content
  const handleInputChange = useCallback((event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(event.target.value);

    const textarea = event.target;
    // Reset height to auto to get the correct scrollHeight
    textarea.style.height = "auto";
    // Set height to scrollHeight, capped at max-height from CSS
    textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
  }, []);

  const toggle = useCallback(() => {
    setIsOpen(prev => {
      // Cancel any in-flight request when closing the chat
      if (prev && abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
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

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = input.trim();
    if (!trimmed) {
      return;
    }

    // Cancel any previous in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Create new AbortController for this request
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

    // Reset textarea height after sending
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }

    setIsSending(true);
    fetch(CHAT_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
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
        // Play notification sound when message is received
        playNotificationSound();
      })
      .catch(errorInstance => {
        // Ignore abort errors - they're expected when cancelling
        if (errorInstance instanceof Error && errorInstance.name === "AbortError") {
          return;
        }
        setError(errorInstance instanceof Error ? errorInstance.message : "Something went wrong.");
      })
      .finally(() => {
        // Only update state if this controller wasn't replaced
        if (abortControllerRef.current === controller) {
          setIsSending(false);
          abortControllerRef.current = null;
        }
      });
  };

  return (
    <div className={styles.widget} aria-live="polite">
      {isOpen ? (
        <div className={styles.panel}>
          <div className={styles.header}>
            <h3>How may I help you?</h3>
            <button className={styles.closeButton} onClick={toggle} aria-label="Close helper">
              ×
            </button>
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
          </div>
          <form className={styles.composer} onSubmit={handleSubmit}>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={event => {
                // Send on Enter (without Shift for new line)
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  if (input.trim() && !isSending) {
                    handleSubmit(event as unknown as React.FormEvent<HTMLFormElement>);
                  }
                }
              }}
              placeholder="Ask anything about Playfunia..."
              rows={1}
              disabled={isSending}
            />
            <button type="submit" disabled={isSending}>
              {isSending ? "Sending..." : "Send"}
            </button>
          </form>
          {isSending ? <div className={styles.status}>Thinking...</div> : null}
          {error ? <div className={styles.status}>{error}</div> : null}
        </div>
      ) : null}

      <button className={styles.toggleButton} onClick={toggle}>
        {isOpen ? "Hide assistant" : "Need help? Chat with us"}
      </button>
    </div>
  );
}
