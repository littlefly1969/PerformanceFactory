/** Il marchio PF (tracciato della demo PF10), nel colore del testo intorno. */
export function PFMark({ size = 24 }: { size?: number }) {
  return (
    <svg
      aria-label="Performance Factory"
      role="img"
      viewBox="0 0 50.762 42.004"
      width={size}
      height={(size * 42.004) / 50.762}
    >
      <path
        d="M6.21 42 9.518 25.148H36.27c.782 0 1.454-.553 1.606-1.32l2.407-12.274c.136-.704-.403-1.356-1.119-1.356H0L1.174 4.221C1.654 1.77 3.806 0 6.31 0h34.272c6.405 0 11.22 5.84 9.987 12.119L47.63 27.094c-.942 4.793-5.15 8.255-10.042 8.255H17.91l-1.307 6.655H6.206Z"
        fill="currentColor"
      />
    </svg>
  );
}
