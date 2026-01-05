import { useCallback, useMemo, useRef, useState } from "react";

import styles from "./Chatbot.module.css";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

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
                {message.content}
              </div>
            ))}
          </div>
          <form className={styles.composer} onSubmit={handleSubmit}>
            <textarea
              value={input}
              onChange={event => setInput(event.target.value)}
              placeholder="Ask anything about Playfunia..."
              rows={2}
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
