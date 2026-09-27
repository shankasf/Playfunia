type StrikePriceProps = {
  price: number;
  originalPrice?: number;
};

/**
 * Price with the regular price struck through beside it when a discount applies
 * (e.g. weekday party packages). Renders just the price otherwise.
 */
export function StrikePrice({ price, originalPrice }: StrikePriceProps) {
  const discounted = originalPrice != null && originalPrice > price;
  return (
    <span>
      {discounted && (
        <s style={{ opacity: 0.55, fontWeight: 400, marginRight: 6 }}>${originalPrice.toFixed(2)}</s>
      )}
      ${price.toFixed(2)}
    </span>
  );
}
