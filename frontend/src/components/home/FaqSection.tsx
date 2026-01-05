import { useState } from "react";

import type { FaqItem } from "../../data/types";
import styles from "./FaqSection.module.css";

interface Props {
  items: FaqItem[];
  isLoading?: boolean;
  sectionId?: string;
  tagLabel?: string;
  title?: string;
  description?: string;
}

export function FaqSection({
  items,
  isLoading,
  sectionId = "faq",
  tagLabel = "Need-to-know details",
  title = "Frequently asked questions",
  description = "Everything from socks to snacks—and how we keep play safe and joyful for every kiddo.",
}: Props) {
  const [openId, setOpenId] = useState<string | null>(null);
  const faqs = isLoading ? new Array(5).fill(null) : items;

  const toggle = (id: string) => {
    setOpenId(prev => (prev === id ? null : id));
  };

  return (
    <section className={styles.section} id={sectionId}>
      <div className={styles.header}>
        <span className={styles.tag}>{tagLabel}</span>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      <div className={styles.list}>
        {faqs.map((faq, index) => {
          const id = faq?.id ?? `placeholder-${index}`;
          const isOpen = openId === id;

          return (
            <article key={id} className={`${styles.item} ${isOpen ? styles.open : ""}`}>
              <button className={styles.question} onClick={() => toggle(id)}>
                <span>{faq?.question ?? "Play question coming soon..."}</span>
                <span className={styles.icon}>{isOpen ? "−" : "+"}</span>
              </button>
              <div className={styles.answer} aria-hidden={!isOpen}>
                <p>{faq?.answer ?? "Hang tight while we get answers ready for you."}</p>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}