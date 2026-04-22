export interface BreadcrumbProps {
  label: string;
  to: string;
  lastChild?: boolean;
}

export function Breadcrumb({ label, to, lastChild }: BreadcrumbProps) {
  return (
    <li className="inline-flex items-center">
      <a
        href={to}
        className="flex items-center text-sm text-gray-500 hover:text-blue-600 focus:outline-none focus:text-blue-600 dark:text-neutral-500 dark:hover:text-blue-500 dark:focus:text-blue-500"
      >
        <svg
          className="flex-shrink-0 me-3 size-4"
          xmlns="http://www.w3.org/2000/svg"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <title>{label}</title>
          <rect width="7" height="7" x="14" y="3" rx="1" />
          <path d="M10 21V8a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-5a1 1 0 0 0-1-1H3" />
        </svg>
        {label}
        {!lastChild ? (
          <svg
            className="flex-shrink-0 mx-2 overflow-visible size-4 text-gray-400 dark:text-neutral-600"
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <title>next</title>
            <path d="m9 18 6-6-6-6" />
          </svg>
        ) : null}
      </a>
    </li>
  );
}
