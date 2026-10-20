import React, { type ReactNode } from "react";
import { IconArrowLeft, IconMaximize } from "@tabler/icons-react";
import type { TheaterMedia } from "./model";
import styles from "./theater.module.css";

type Props = {
  item: TheaterMedia;
  onEnter: () => void;
  onBack: () => void;
};

/** Normal single-media destination for the item most recently viewed in theater. */
export function SingleMediaView({
  item,
  onEnter,
  onBack,
}: Readonly<Props>): ReactNode {
  return (
    <main className={styles.preview} aria-label="Single-media view">
      <header className={styles.previewHeader}>
        <button className={styles.fileButton} onClick={onBack}>
          <IconArrowLeft /> Back to preview
        </button>
        <span>Interactive prototype</span>
      </header>
      <section className={styles.singleMediaHeading}>
        <div>
          <h1>{item.title}</h1>
          <p>{item.date}</p>
        </div>
        <button className={styles.primaryButton} onClick={onEnter}>
          <IconMaximize /> Enter theater
        </button>
      </section>
      <figure className={styles.singleMediaFrame}>
        {item.kind === "photo" ? (
          <img src={item.source} alt={item.title} />
        ) : (
          <video
            src={item.source}
            poster={item.poster}
            controls
            playsInline
            preload="metadata"
            aria-label={item.title}
          />
        )}
        <figcaption>{item.note}</figcaption>
      </figure>
    </main>
  );
}
