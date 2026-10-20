import React, { useRef, useState, type ReactNode } from "react";
import { SingleMediaView } from "./SingleMediaView";
import { Preview } from "./Preview";
import { TheaterStage } from "./TheaterStage";
import {
  SAMPLE_MEDIA,
  SAMPLE_COMMENTS,
  type TheaterComment,
  type TheaterDraft,
  type TheaterMedia,
} from "./model";

/** Owns only temporary prototype state; the product remains untouched. */
export function TheaterPrototype(): ReactNode {
  const [media, setMedia] = useState(SAMPLE_MEDIA);
  const [selected, setSelected] = useState<number>();
  const [isTheaterOpen, setIsTheaterOpen] = useState(false);
  const [comments, setComments] = useState(SAMPLE_COMMENTS);
  const [drafts, setDrafts] = useState<Record<string, TheaterDraft>>({});
  const localUrls = useRef<string[]>([]);
  const host = useRef<HTMLDivElement>(null);
  const enter = (index: number) => {
    setSelected(index);
    setIsTheaterOpen(true);
    void host.current?.requestFullscreen?.().catch(() => {
      /* Viewport theater remains available. */
    });
  };
  const onFiles = (files: FileList) => {
    localUrls.current.forEach((url) => {
      return URL.revokeObjectURL(url);
    });
    const selectedMedia: TheaterMedia[] = Array.from(files)
      .filter((file) => {
        return /^(image|video)\//.test(file.type);
      })
      .map((file, index) => {
        const source = URL.createObjectURL(file);
        localUrls.current.push(source);
        return {
          id: `local-${index}-${file.lastModified}`,
          kind: file.type.startsWith("video/") ? "video" : "photo",
          source,
          title: file.name,
          date: `${index + 1} of ${files.length} · Local selection`,
          note: "Local media · never uploaded",
        };
      });
    if (selectedMedia.length) {
      setMedia(selectedMedia);
      setComments({});
      setDrafts({});
    }
  };
  const addComment = (itemId: string, comment: TheaterComment) => {
    return setComments((current) => {
      return {
        ...current,
        [itemId]: [...(current[itemId] ?? []), comment],
      };
    });
  };
  return (
    <div ref={host}>
      {selected === undefined ? (
        <Preview media={media} onEnter={enter} onFiles={onFiles} />
      ) : !isTheaterOpen ? (
        <SingleMediaView
          item={media[selected]!}
          onEnter={() => {
            enter(selected);
          }}
          onBack={() => {
            setSelected(undefined);
          }}
        />
      ) : (
        <TheaterStage
          media={media}
          selected={selected}
          onSelect={setSelected}
          host={host}
          onExit={() => {
            if (document.fullscreenElement) void document.exitFullscreen();
            setIsTheaterOpen(false);
          }}
          comments={comments[media[selected]!.id] ?? []}
          onComment={addComment}
          draft={
            drafts[media[selected]!.id] ?? { body: "", hasCaptured: false }
          }
          onDraft={(draft) => {
            return setDrafts((current) => {
              return {
                ...current,
                [media[selected]!.id]: draft,
              };
            });
          }}
        />
      )}
    </div>
  );
}
