/**
 * The studio mark: an {8/3} star polygon drawn as one unbroken path —
 * the same figure the particle cloud lands on in the final section, so
 * the logo in the nav and the object on the stage are literally the
 * same shape.
 */
export default function Mark({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.1"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M12 3 L18.36 18.36 L3 12 L18.36 5.64 L12 21 L5.64 5.64 L21 12 L5.64 18.36 Z" />
    </svg>
  );
}
