import { useEffect, useMemo, useState, type ImgHTMLAttributes, type VideoHTMLAttributes } from "react";
import { twimgDisplaySrcCandidates } from "./api/twimgProxy";

type TwimgImgProps = { originalSrc: string } & Omit<ImgHTMLAttributes<HTMLImageElement>, "src">;

/** Loads TwIMG / X CDN URLs: tries **direct** first (often works in the browser when the API proxy is blocked), then `/api/cdn/twimg`. */
export function TwimgImg({ originalSrc, onError, ...rest }: TwimgImgProps) {
  const chain = useMemo(() => twimgDisplaySrcCandidates(originalSrc), [originalSrc]);
  const [i, setI] = useState(0);

  useEffect(() => {
    setI(0);
  }, [originalSrc]);

  if (!chain.length || i >= chain.length) return null;

  return (
    <img
      src={chain[i]}
      alt={rest.alt ?? ""}
      referrerPolicy="no-referrer"
      decoding="async"
      {...rest}
      onError={(e) => {
        onError?.(e);
        setI((x) => x + 1);
      }}
    />
  );
}

type TwimgVideoProps = { originalUrl: string | undefined } & Omit<VideoHTMLAttributes<HTMLVideoElement>, "src">;

export function TwimgVideo({ originalUrl, onError, ...rest }: TwimgVideoProps) {
  const chain = useMemo(() => twimgDisplaySrcCandidates(originalUrl), [originalUrl]);
  const [i, setI] = useState(0);

  useEffect(() => {
    setI(0);
  }, [originalUrl]);

  if (!chain.length || i >= chain.length) return null;

  return (
    <video
      src={chain[i]}
      {...rest}
      onError={(e) => {
        onError?.(e);
        setI((x) => x + 1);
      }}
    />
  );
}
