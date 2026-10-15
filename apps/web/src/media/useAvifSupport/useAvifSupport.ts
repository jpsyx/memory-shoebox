import { useEffect, useState } from "react";

// Owned 1x1 white AVIF generated with Sharp, used only as a local decode probe.
const PROBE =
  "data:image/avif;base64,AAAAHGZ0eXBhdmlmAAAAAG1pZjFhdmlmbWlhZgAAANZtZXRhAAAAAAAAACFoZGxyAAAAAAAAAABwaWN0AAAAAAAAAAAAAAAAAAAAACJpbG9jAAAAAERAAAEAAQAAAAAA+gABAAAAAAAAAB0AAAAjaWluZgAAAAAAAQAAABVpbmZlAgAAAAABAABhdjAxAAAAAA5waXRtAAAAAAABAAAAVmlwcnAAAAA4aXBjbwAAAAxhdjFDgSACAAAAABRpc3BlAAAAAAAAAAEAAAABAAAAEHBpeGkAAAAAAwgICAAAABZpcG1hAAAAAAAAAAEAAQOBAgMAAAAlbWRhdBIACgc4AAaQENBpMhAZQmMEwAA0AACQQMkcYIpq";
let support: boolean | undefined;
let pending: Promise<boolean> | undefined;

function _probeAvifSupport(): Promise<boolean> {
  pending ??= new Promise<boolean>((settle) => {
    const image = document.createElement("img");
    const finish = (supported: boolean) => {
      if (support !== undefined) {
        return;
      }
      support = supported;
      clearTimeout(timeout);
      image.onload = null;
      image.onerror = null;
      settle(supported);
    };
    const timeout = setTimeout(() => {
      finish(false);
    }, 1000);
    image.onerror = () => {
      finish(false);
    };
    image.onload = () => {
      void image.decode().then(
        () => {
          finish(image.naturalWidth === 1 && image.naturalHeight === 1);
        },
        () => {
          finish(false);
        },
      );
    };
    image.src = PROBE;
  });
  return pending;
}

/** Publishes a bounded local AVIF decode result to every mounted consumer. */
export function useAvifSupport(): boolean {
  const [supported, setSupported] = useState(support === true);
  useEffect(function observeAvifCapability() {
    let isMounted = true;
    void _probeAvifSupport().then((result) => {
      if (isMounted) {
        setSupported(result);
      }
    });
    return () => {
      isMounted = false;
    };
  }, []);
  return supported;
}
