const SUPPORTED_CARRIER_SLUGS = new Set([
  "usps",
  "ups",
  "ups mail innovations",
  "fedex",
  "fedex smartpost",
  "dhl",
  "dhl express",
  "dhl ecommerce",
  "dhl ecommerce solutions",
  "dhl express usa",
  "ontrac",
  "lasership",
  "canada post",
  "purolator",
  "australia post",
  "royal mail",
  "amazon",
  "amazon shipping",
  "amazon logistics",
]);

function normalize(carrier: string | null | undefined) {
  return (carrier ?? "").trim().toLowerCase();
}

export function isSupportedCarrier(carrier: string | null | undefined) {
  const slug = normalize(carrier);
  if (!slug) return false;
  if (SUPPORTED_CARRIER_SLUGS.has(slug)) return true;
  for (const supported of SUPPORTED_CARRIER_SLUGS) {
    if (slug.includes(supported)) return true;
  }
  return false;
}
