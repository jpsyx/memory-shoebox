import React from "react";
import { VideoPlayer } from "@videojs/react/video";
import { createRoot } from "react-dom/client";
import {
  IconArrowLeft,
  IconLayoutSidebarRight,
  IconLock,
  IconLink,
  IconVideo,
} from "@tabler/icons-react";
import { Player } from "./Player";
import { Composer, Conversation } from "./Conversation";
import { usePreview, type Preview } from "./usePreview";
import "./style.css";

function PreviewToolbar({ preview: p }: { preview: Preview }) {
  return (
    <div className="preview-toolbar">
      <div className="prototype-label">
        <strong>Video conversations</strong>
        <span>Interactive prototype · sample data</span>
      </div>
      <span className="selected-layout">
        <IconLayoutSidebarRight size={16} />
        Comments beside · Video.js React
      </span>
      <label className="file-choice">
        <IconVideo size={16} />
        Try your own video
        <input
          type="file"
          accept="video/*"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) {
              p.onLoadFile(file);
            }
          }}
        />
      </label>
    </div>
  );
}

function App() {
  const p = usePreview();
  const onCopy = () => {
    const url = new URL(location.href);
    url.searchParams.set("t", String(Math.floor(p.position)));
    void navigator.clipboard.writeText(url.href).then(
      () => {
        return p.setNotice("Preview link copied.");
      },
      () => {
        return p.setNotice("Copy the preview URL from the address bar.");
      },
    );
  };
  return (
    <>
      <PreviewToolbar preview={p} />
      <main className="watch-page sidebar">
        <header className="page-header">
          <a
            className="back-link"
            href="/prototypes/video-comments/"
            aria-label="Reset to sample video"
          >
            <IconArrowLeft size={22} />
          </a>
          <div className="title-block">
            <h1>
              {p.source.startsWith("blob:")
                ? "Your video"
                : "A few little steps"}
            </h1>
            <div className="video-meta">
              <span className="avatar avatar-j tiny">J</span>
              <span>Jamie</span>
              <span>·</span>
              <span>October 7</span>
              <span className="privacy">
                <IconLock size={12} />
                Family only
              </span>
            </div>
          </div>
          <button className="copy-link" onClick={onCopy}>
            <IconLink size={17} />
            <span>Copy link</span>
          </button>
        </header>
        <div className="watch-grid">
          <section className="media-column">
            <Player preview={p} />
            <div className="video-caption">
              <h2>
                {p.source.startsWith("blob:")
                  ? "A conversation around your video."
                  : "The little moments are the big ones."}
              </h2>
              <p>
                {p.source.startsWith("blob:")
                  ? "Pause on a moment and leave a comment or reaction."
                  : "A little encouragement, a lot of determination."}
              </p>
              <span className="sample-note">
                {p.source.startsWith("blob:")
                  ? "Local video · stays in this browser · never uploaded"
                  : "Generated sample clip · 10 seconds · no family footage"}
              </span>
            </div>
          </section>
          <aside className="conversation-panel" aria-label="Conversation">
            <div className="panel-tabs">
              <span>
                Comments <b>{p.comments.length}</b>
              </span>
              <span className="panel-private">
                <IconLock size={14} />
                Our circle
              </span>
            </div>
            <Composer
              key={p.source}
              seconds={p.draftSeconds ?? p.position}
              isAnchored={p.isAnchored}
              onStart={p.onStart}
              onToggleAnchor={() => {
                return p.setIsAnchored(!p.isAnchored);
              }}
              onSubmit={p.onSubmit}
              inputRef={p.inputRef}
            />
            <Conversation
              comments={p.comments}
              onSeek={p.onSeek}
              onReply={p.onReply}
            />
          </aside>
        </div>
        <footer className="preview-footer">
          <span>
            Preview only. Comments and reactions reset when this page reloads.
          </span>
          <div>
            <button
              onClick={() => {
                return p.onReset(true);
              }}
            >
              Empty state
            </button>
            <button
              onClick={() => {
                return p.onReset(false);
              }}
            >
              Restore samples
            </button>
            <a href="./research.html">Research & decisions</a>
          </div>
        </footer>
      </main>
      <div className="live-notice" role="status" key={p.notice}>
        {p.notice}
      </div>
    </>
  );
}

createRoot(document.getElementById("root")!).render(
  <VideoPlayer>
    <App />
  </VideoPlayer>,
);
