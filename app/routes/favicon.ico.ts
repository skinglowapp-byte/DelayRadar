export function loader() {
  const icon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 1200">
    <rect width="1200" height="1200" rx="220" fill="#1c2333"/>
    <path d="M600 170 L970 300 V590 C970 830 800 970 600 1040 C400 970 230 830 230 590 V300 Z" fill="#d45f49"/>
    <path d="M600 170 L970 300 V590 C970 830 800 970 600 1040 Z" fill="#c4523f"/>
    <path d="M735 800 V540 A135 135 0 0 0 465 540 V610" fill="none" stroke="#fffdf6" stroke-width="96" stroke-linecap="round"/>
    <path d="M350 600 H580 L465 795 Z" fill="#fffdf6" stroke="#fffdf6" stroke-width="20" stroke-linejoin="round"/>
  </svg>`;

  return new Response(icon, {
    headers: {
      "Cache-Control": "public, max-age=86400",
      "Content-Type": "image/svg+xml",
    },
  });
}
