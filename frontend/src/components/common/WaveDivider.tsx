import styles from "./WaveDivider.module.css";

const COLOR_MAP: Record<string, string> = {
  pink: "#ff6b9d",
  purple: "#7c3aed",
  yellow: "#fbbf24",
  turquoise: "#06b6d4",
};

interface Props {
  color: "pink" | "purple" | "yellow" | "turquoise";
  flip?: boolean;
}

export function WaveDivider({ color, flip }: Props) {
  const fill = COLOR_MAP[color];
  return (
    <div
      className={`${styles.wrapper} ${flip ? styles.flip : ""}`}
      aria-hidden="true"
    >
      <svg
        className={styles.svg}
        viewBox="0 0 1440 100"
        preserveAspectRatio="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M0,40 C240,100 480,0 720,50 C960,100 1200,0 1440,40 L1440,100 L0,100 Z"
          fill={fill}
        />
      </svg>
    </div>
  );
}
