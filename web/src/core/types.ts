export interface LetterboxMeta {
  w0: number;
  h0: number;
  r: number;
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface Detection {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  score: number;
}
