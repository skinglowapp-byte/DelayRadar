export function loader() {
  const icon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
    <rect width="64" height="64" rx="12" fill="#1a2433"/>
    <circle cx="32" cy="32" r="20" fill="none" stroke="#fdf8f0" stroke-width="5"/>
    <path d="M32 16v16l12 8" fill="none" stroke="#d35d47" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="32" cy="32" r="4" fill="#2c8c68"/>
  </svg>`;

  return new Response(icon, {
    headers: {
      "Cache-Control": "public, max-age=86400",
      "Content-Type": "image/svg+xml",
    },
  });
}
