import React, { type ReactNode } from "react";
import {
  IconMaximize,
  IconPhotoPlus,
  IconPlayerPlayFilled,
} from "@tabler/icons-react";
import type { TheaterMedia } from "./model";
import styles from "./theater.module.css";

type Props = {
  media: TheaterMedia[];
  onEnter: (index: number) => void;
  onFiles: (files: FileList) => void;
};
/** Review entry point with explicit sample provenance and local media import. */
export function Preview({
  media,
  onEnter,
  onFiles,
}: Readonly<Props>): ReactNode {
  return (
    <main className={styles.preview}>
      <header className={styles.previewHeader}>
        <a href="./">Memory Shoebox</a>
        <span>Interactive prototype</span>
      </header>
      <section className={styles.previewIntro}>
        <div>
          <h1>A little closer to the moment.</h1>
          <p>Photos, videos, and your people. One uninterrupted view.</p>
        </div>
        <button
          className={styles.primaryButton}
          onClick={() => {
            return onEnter(0);
          }}
        >
          <IconMaximize /> Enter theater
        </button>
      </section>
      <div className={styles.previewGrid}>
        {media.map((item, index) => {
          return (
            <button
              key={item.id}
              className={styles.previewTile}
              onClick={() => {
                return onEnter(index);
              }}
              aria-label={`Open ${item.title} in theater`}
            >
              <div className={styles.previewImage}>
                <img src={item.poster ?? item.source} alt={item.title} />
                {item.kind === "video" ? (
                  <span>
                    <IconPlayerPlayFilled /> Video
                  </span>
                ) : null}
              </div>
              <strong>{item.title}</strong>
              <span>{item.date}</span>
            </button>
          );
        })}
      </div>
      <footer className={styles.previewFooter}>
        <div>
          <strong>Try it with your own memories</strong>
          <p>
            Choose photos and videos. They stay on this device, in selection
            order.
          </p>
          <label className={styles.fileButton}>
            <IconPhotoPlus /> Choose local media
            <input
              type="file"
              accept="image/*,video/*"
              multiple
              onChange={(event) => {
                if (event.target.files?.length) onFiles(event.target.files);
              }}
            />
          </label>
        </div>
        <p className={styles.reviewNote}>
          Sample images and clips are generated. Comments and reactions are
          illustrative and reset on reload. This preview does not connect to
          your Shoebox.
        </p>
      </footer>
    </main>
  );
}
