import { useEffect, useState, type ImgHTMLAttributes } from "react";
import { mediaUrl } from "../api/client";

type Props = ImgHTMLAttributes<HTMLImageElement> & {
  thumb: string;
  original?: string;
};

export default function MediaImg({ thumb, original, style, alt, ...rest }: Props) {
  const [src, setSrc] = useState(() => mediaUrl(thumb));

  useEffect(() => {
    setSrc(mediaUrl(thumb));
  }, [thumb]);

  return (
    <img
      alt={alt || ""}
      src={src}
      onError={() => {
        if (original) {
          const fallback = mediaUrl(original);
          if (fallback && fallback !== src) setSrc(fallback);
        }
      }}
      style={{ objectFit: "cover", background: "#f3f4f6", display: "block", ...style }}
      {...rest}
    />
  );
}
